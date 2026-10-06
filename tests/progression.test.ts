import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHAMPIONSHIPS, careerLevel, rankForMmr, seasonId, type ReplayData } from '../shared/progression.js';
import { MatchmakingQueue, ReplayRecorder, calculateMmr } from '../server/competitive.js';
import { PlayerStore, validateReplay } from '../server/player-store.js';
import { TRACKS } from '../shared/track.js';

const now = Date.UTC(2026, 9, 6, 12);
async function fixture(t: test.TestContext, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'kart-career-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: await PlayerStore.open(directory, { now: () => now, ...options }) };
}
function replay(id = 'test-replay', createdAt = now, finishTime = 60, ranked = false): ReplayData {
  return { version: 1, id, trackId: 'lagon', createdAt, durationMs: finishTime * 1000, season: seasonId(new Date(createdAt)), ranked,
    drivers: [{ playerId: 'driver', name: 'Pilote', color: '#ff6b6b', rank: 1, finished: true, finishTime,
      frames: [[0, 0, 0, 0, 0, 0, 0], [finishTime * 1000, 100, 200, 1200, 0, 3, 16]] }] };
}

test('six championships introduce all twelve tracks, gate garage tiers, and ranks/seasons have stable boundaries', () => {
  assert.equal(CHAMPIONSHIPS.length, 6);
  assert.deepEqual([...new Set(CHAMPIONSHIPS.flatMap(cup => [...cup.tracks]))].sort(), TRACKS.map(track => track.id).sort());
  assert.equal(careerLevel([]), 0); assert.equal(careerLevel(['discovery']), 1);
  assert.equal(careerLevel(['discovery', 'weather']), 2); assert.equal(careerLevel(['metamorphosis']), 3);
  assert.equal(rankForMmr(899), 'Bronze'); assert.equal(rankForMmr(900), 'Silver');
  assert.equal(rankForMmr(1100), 'Gold'); assert.equal(rankForMmr(1350), 'Platinum');
  assert.equal(rankForMmr(1650), 'Diamond'); assert.equal(rankForMmr(1950), 'Master');
  assert.equal(seasonId(new Date('2026-03-31T23:59:59Z')), '2026-Q1');
  assert.equal(seasonId(new Date('2026-04-01T00:00:00Z')), '2026-Q2');
});

test('identity tokens are opaque, hashed on disk, absent from every public projection, and survive restart', async t => {
  const { store, directory } = await fixture(t);
  const account = await store.createPlayer('  Test pilote  ');
  assert.match(account.token, /^lk_[A-Za-z0-9_-]{43}$/); assert.equal(account.profile.name, 'Test pilote');
  assert.equal(store.authenticate(account.token)?.id, account.profile.id);
  assert.equal(store.authenticate(account.profile.id), null); assert.equal(store.authenticate('lk_' + 'x'.repeat(43)), null);
  const stored = await readFile(join(directory, 'players.json'), 'utf8');
  assert.ok(!stored.includes(account.token)); assert.match(stored, /"tokenHash":"[a-f0-9]{64}"/);
  assert.ok(!JSON.stringify(account.profile).includes('token')); assert.ok(!JSON.stringify(store.getProfile(account.profile.id)).includes('token'));
  account.profile.stats.races = 900; account.profile.completedChampionships.push('masters');
  assert.equal(store.getProfile(account.profile.id)!.stats.races, 0); assert.equal(store.getProfile(account.profile.id)!.careerLevel, 0);
  const restarted = await PlayerStore.open(directory, { now: () => now });
  assert.equal(restarted.authenticate(account.token)?.id, account.profile.id);
  assert.equal((await restarted.updateName(account.profile.id, 'Nouveau')).name, 'Nouveau');
});

test('concurrent career writes are serialised, rewards are idempotent, and locked or incomplete cups do not unlock parts', async t => {
  const { store } = await fixture(t);
  const accounts = await Promise.all(Array.from({ length: 6 }, (_, i) => store.createPlayer(`Joueur ${i}`)));
  assert.equal(new Set(accounts.map(account => account.profile.id)).size, 6);
  const id = accounts[0]!.profile.id;
  await assert.rejects(store.completeChampionship(id, 'masters', 1, 6), /verrouillé/);
  assert.equal((await store.completeChampionship(id, 'discovery', 4, 2)).careerLevel, 0);
  assert.equal((await store.completeChampionship(id, 'discovery', 1, 1)).careerLevel, 0);
  await Promise.all(Array.from({ length: 5 }, () => store.completeChampionship(id, 'discovery', 1, 2)));
  assert.equal(store.getProfile(id)!.xp, 150); assert.equal(store.getProfile(id)!.careerLevel, 1);
  assert.equal((await store.completeChampionship(id, 'weather', 2, 3)).careerLevel, 2);
  assert.equal((await store.completeChampionship(id, 'metamorphosis', 3, 4)).careerLevel, 3);
});

test('ranked results update pairwise MMR once, include DNF losses, exclude invalid identities, and publish no secrets', async t => {
  const { store } = await fixture(t);
  const accounts = await Promise.all(['Alice', 'Basile', 'Charlie'].map(name => store.createPlayer(name)));
  const entries = accounts.map((account, i) => ({ playerId: account.profile.id, rank: i + 1, finished: i < 2, finishTime: i < 2 ? 60 + i : 0 }));
  const race = { id: 'ranked-round-1', trackId: 'lagon', ranked: true, finishedAt: now, entries };
  const results = await Promise.all([store.recordRace(race), store.recordRace(race)]);
  assert.equal(results.filter(result => result.recorded).length, 1);
  assert.deepEqual(accounts.map(account => store.getProfile(account.profile.id)!.mmr), [820, 800, 780]);
  assert.equal(store.getProfile(accounts[0]!.profile.id)!.stats.races, 1);
  assert.equal(store.getProfile(accounts[0]!.profile.id)!.stats.bestTimes.lagon, 60);
  assert.equal(store.getProfile(accounts[2]!.profile.id)!.stats.finishes, 0);
  assert.deepEqual(store.leaderboard().map(entry => entry.name), ['Alice', 'Basile', 'Charlie']);
  for (const account of accounts) assert.ok(!JSON.stringify(store.leaderboard()).includes(account.token));
  await assert.rejects(store.recordRace({ ...race, id: 'unknown-id', entries: [{ ...entries[0]!, playerId: 'missing' }] }), /introuvable/);
  await assert.rejects(store.recordRace({ ...race, id: 'duplicate', entries: [entries[0]!, entries[0]!] }), /invalide/);
  await assert.rejects(store.recordRace({ ...race, id: 'solo-ranked', entries: [entries[0]!] }), /deux identités/);
  await assert.rejects(store.recordRace({ ...race, id: 'future', finishedAt: now + 120_000 }), /futur/);
});

test('new seasons softly reset MMR, preserve lifetime career, and archive previous leaderboards', async t => {
  let clock = now;
  const { store, directory } = await fixture(t, { now: () => clock });
  const a = await store.createPlayer('Alice'), b = await store.createPlayer('Basile');
  await store.recordRace({ id: 'q4-result', trackId: 'lagon', ranked: true, finishedAt: clock,
    entries: [{ playerId: a.profile.id, rank: 1, finished: true, finishTime: 60 }, { playerId: b.profile.id, rank: 2, finished: true, finishTime: 65 }] });
  await store.completeChampionship(a.profile.id, 'discovery', 1, 2);
  clock = Date.UTC(2027, 0, 1);
  assert.equal(store.getProfile(a.profile.id)!.mmr, 810); assert.equal(store.getProfile(a.profile.id)!.season, '2027-Q1');
  assert.equal(store.getProfile(a.profile.id)!.careerLevel, 1); assert.equal(store.leaderboard().length, 0);
  assert.equal(store.leaderboard(50, '2026-Q4')[0]!.mmr, 820);
  await store.recordRace({ id: 'q1-result', trackId: 'lagon', ranked: true, finishedAt: clock,
    entries: [{ playerId: b.profile.id, rank: 1, finished: true, finishTime: 60 }, { playerId: a.profile.id, rank: 2, finished: true, finishTime: 65 }] });
  assert.equal(store.getProfile(a.profile.id)!.stats.races, 2); assert.equal(store.getProfile(a.profile.id)!.ranked.races, 1);
  const restarted = await PlayerStore.open(directory, { now: () => clock });
  assert.deepEqual(restarted.leaderboard(), store.leaderboard());
});

test('Elo rewards an upset more than an expected win, ties DNF racers, and bounds ratings', () => {
  const upset = calculateMmr([{ playerId: 'low', mmr: 800, rank: 1, finished: true }, { playerId: 'high', mmr: 1400, rank: 2, finished: true }]);
  assert.ok(upset.get('low')! > 830); assert.ok(upset.get('high')! < 1370);
  const dnfs = calculateMmr([{ playerId: 'a', mmr: 800, rank: 1, finished: false }, { playerId: 'b', mmr: 800, rank: 2, finished: false }]);
  assert.equal(dnfs.get('a'), 800); assert.equal(dnfs.get('b'), 800);
  assert.equal(calculateMmr([{ playerId: 'a', mmr: 0, rank: 2, finished: false }, { playerId: 'b', mmr: 0, rank: 1, finished: true }]).get('a'), 0);
});

test('matchmaking forms bounded groups by MMR, expands with wait, never duplicates a player, and handles reservation failure', () => {
  const queue = new MatchmakingQueue();
  queue.join('a', 800, 0); queue.join('b', 840, 0); queue.join('far', 1500, 0);
  queue.join('a', 800, 1000); assert.equal(queue.size, 3); assert.equal(queue.popMatches(2000).length, 0);
  const match = queue.popMatches(3100)[0]!;
  assert.deepEqual(match.players.map(player => player.playerId), ['a', 'b']); assert.equal(queue.popMatches(3200).length, 0);
  assert.equal(queue.poll('a', 3200).state, 'matching');
  queue.releaseMatch(match.id, 3300); assert.equal(queue.poll('a', 3300).state, 'queued');
  const retry = queue.popMatches(3400)[0]!; assert.ok(queue.assignMatch(retry.id, 'ABC234'));
  assert.deepEqual(queue.poll('a', 3500), { state: 'matched', matchId: retry.id, roomId: 'ABC234' });
  assert.equal(queue.consume('a', 'WRONG'), false); assert.equal(queue.consume('a', 'ABC234'), true);
  assert.equal(queue.poll('a', 3600).state, 'idle'); assert.ok(queue.cancel('b')); assert.equal(queue.size, 1);
  assert.equal(queue.poll('far', 50_000).state, 'idle');
  const wide = new MatchmakingQueue(); wide.join('low', 800, 0); wide.join('high', 1500, 0);
  assert.equal(wide.popMatches(20_000).length, 0); assert.equal(wide.popMatches(30_000).length, 1);
});

test('matchmaking caps eight racers per group, enforces capacity, and removes stale queue entries', () => {
  const queue = new MatchmakingQueue(10);
  for (let i = 0; i < 10; i++) queue.join(`p${i}`, 800, 0);
  assert.throws(() => queue.join('overflow', 800, 1), /pleine/);
  assert.deepEqual(queue.popMatches(3100).map(match => match.players.length), [8, 2]);
  assert.equal(queue.poll('p0', 50_000).state, 'idle'); assert.equal(queue.size, 0);
});

test('cancelling one matched reservation releases the other players into a fresh match', () => {
  const queue = new MatchmakingQueue();
  for (const id of ['a', 'b', 'c']) queue.join(id, 800, 0);
  const original = queue.popMatches(3100)[0]!; queue.assignMatch(original.id, 'OLD123');
  assert.equal(queue.cancel('a', 3200), true);
  assert.equal(queue.poll('a', 3200).state, 'idle');
  assert.equal(queue.poll('b', 3200).state, 'queued'); assert.equal(queue.poll('c', 3200).state, 'queued');
  const replacement = queue.popMatches(3300)[0]!;
  assert.notEqual(replacement.id, original.id); assert.deepEqual(replacement.players.map(player => player.playerId), ['b', 'c']);
  queue.releaseMatch(original.id, 3400);
  assert.equal(queue.poll('b', 3400).state, 'matching', 'disposing the old room must preserve the replacement match');
});

test('recorder captures bounded quantised trajectories and effect flags without identity secrets or spectator frames', () => {
  const recorder = new ReplayRecorder({ id: 'sample', trackId: 'lagon', ranked: true, createdAt: now });
  const player = { playerId: 'driver', name: 'Pilote', color: '#ff6b6b', x: 1.237, z: -2.411, angle: 0.5,
    speed: 32, lap: 0, rank: 1, finished: false, finishTime: 0, invincible: 1, shield: 2, boost: 1, token: 'never-store' };
  for (let i = 0; i <= 9000; i++) recorder.sample(i / 30, [player, { ...player, playerId: 'watcher', spectator: true }]);
  const result = recorder.finish(300, [{ ...player, lap: 3, finished: true, finishTime: 299.5 }]);
  assert.equal(result.drivers.length, 1); assert.ok(result.drivers[0]!.frames.length <= 1502);
  assert.deepEqual(result.drivers[0]!.frames[0]!.slice(1), [124, -241, 500, 3200, 0, 7]);
  assert.equal(result.drivers[0]!.frames.at(-1)![6], 23); assert.ok(!JSON.stringify(result).includes('never-store'));
  assert.deepEqual(validateReplay(result), result);
});

test('replays survive restart, fastest open/ranked ghosts survive retention, and invalid/path traversal payloads are rejected', async t => {
  const { store, directory } = await fixture(t, { maxReplays: 16 });
  await store.saveReplay(replay('old-fast-open', now, 55));
  await store.saveReplay(replay('old-fast-ranked', now + 1, 58, true));
  for (let i = 0; i < 20; i++) await store.saveReplay(replay(`recent-${i}`, now + 10 + i, 65));
  assert.equal(store.listReplays(undefined, 100).length, 16);
  assert.equal((await store.bestGhost('lagon'))!.replayId, 'old-fast-open');
  assert.equal((await store.bestGhost('lagon', true))!.replayId, 'old-fast-ranked');
  assert.equal((await readdir(join(directory, 'replays'))).length, 16);
  assert.equal(await store.getReplay('recent-0'), null); assert.equal(await store.getReplay('../../players'), null);
  const restarted = await PlayerStore.open(directory, { now: () => now, maxReplays: 16 });
  assert.equal((await restarted.bestGhost('lagon'))!.finishTime, 55);
  await assert.rejects(store.saveReplay({ ...replay(), id: '../outside' }), /invalide/);
  const malformed = replay(); malformed.drivers[0]!.frames[1]![0] = -2;
  await assert.rejects(store.saveReplay(malformed), /Trajectoire/);
  const fakeFinish = replay(); fakeFinish.drivers[0]!.frames[1]![5] = 0;
  await assert.rejects(store.saveReplay(fakeFinish), /Arrivée/);
});

test('corrupt storage fails without erasing the file and failed atomic writes roll back in-memory mutations', async t => {
  const { store, directory } = await fixture(t);
  const account = await store.createPlayer('Pilote');
  await writeFile(join(directory, 'players.json'), '{broken');
  await assert.rejects(PlayerStore.open(directory), /illisible/);
  assert.equal(await readFile(join(directory, 'players.json'), 'utf8'), '{broken');
  await rm(directory, { recursive: true });
  await assert.rejects(store.updateName(account.profile.id, 'Perdu'));
  assert.equal(store.getProfile(account.profile.id)!.name, 'Pilote');
});

test('replay retention stays strictly bounded when twelve tracks have separate open and ranked records', async t => {
  const { store, directory } = await fixture(t, { maxReplays: 16 });
  for (const [index, track] of TRACKS.entries()) {
    await store.saveReplay({ ...replay(`open-${track.id}`, now + index, 50), trackId: track.id });
    await store.saveReplay({ ...replay(`ranked-${track.id}`, now + index + 50, 60, true), trackId: track.id });
  }
  assert.equal(store.listReplays(undefined, 100).length, 16);
  assert.equal((await readdir(join(directory, 'replays'))).length, 16);
  for (const track of TRACKS) assert.ok(await store.bestGhost(track.id, true), `ranked record retained for ${track.id}`);
  const restarted = await PlayerStore.open(directory, { now: () => now, maxReplays: 16 });
  assert.equal(restarted.listReplays(undefined, 100).length, 16);
});
