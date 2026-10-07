import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountError, PlayerStore } from '../server/player-store.js';
import { seasonId, type ReplayData } from '../shared/progression.js';
import { TRACK_LAYOUT_REVISION } from '../shared/track.js';

const now = Date.UTC(2026, 9, 7, 12);
async function fixture(t: test.TestContext, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'kart-accounts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: await PlayerStore.open(directory, { now: () => now, ...options }) };
}
const status = (expected: number) => (error: unknown) => error instanceof AccountError && error.status === expected;

test('username accounts persist salted password hashes and recover on a fresh store without exposing secrets', async t => {
  const { store, directory } = await fixture(t);
  const password = 'CourSeDeClasse_2026';
  const a = await store.registerAccount('  Ａlice_01  ', password);
  const b = await store.registerAccount('Basile', password, undefined, 'Basile pilote');
  assert.equal(a.profile.username, 'Alice_01'); assert.equal(a.profile.name, 'Alice_01');
  assert.equal(b.profile.name, 'Basile pilote'); assert.equal(store.authenticate(a.token)!.id, a.profile.id);
  const text = await readFile(join(directory, 'players.json'), 'utf8');
  assert.ok(!text.includes(password)); assert.ok(!text.includes(a.token)); assert.ok(!text.includes(b.token));
  const saved = JSON.parse(text);
  assert.equal(saved.version, 1);
  assert.equal(saved.players[0].passwordHash.scheme, 'scrypt-v1');
  assert.match(saved.players[0].passwordHash.salt, /^[a-f0-9]{32}$/);
  assert.match(saved.players[0].passwordHash.hash, /^[a-f0-9]{128}$/);
  assert.notEqual(saved.players[0].passwordHash.salt, saved.players[1].passwordHash.salt);
  assert.notEqual(saved.players[0].passwordHash.hash, saved.players[1].passwordHash.hash);
  for (const profile of [a.profile, b.profile, store.getProfile(a.profile.id), store.authenticate(a.token)]) {
    const projected = JSON.stringify(profile);
    assert.ok(!/password|salt|hash|token/i.test(projected));
    assert.ok(!projected.includes(password));
  }
  const reopened = await PlayerStore.open(directory, { now: () => now });
  const recovered = await reopened.loginAccount('alice_01', password);
  assert.equal(recovered.profile.id, a.profile.id);
  assert.equal(reopened.authenticate(a.token)!.id, a.profile.id);
  assert.equal(reopened.authenticate(recovered.token)!.id, a.profile.id);
});

test('linking a legacy anonymous token preserves identity, ranked results, career and replays after restart', async t => {
  const { store, directory } = await fixture(t);
  const guest = await store.createPlayer('Pilote invité'), rival = await store.createPlayer('Rival');
  await store.recordRace({ id: 'legacy-race', trackId: 'lagon', ranked: true, finishedAt: now, entries: [
    { playerId: guest.profile.id, rank: 1, finished: true, finishTime: 60 },
    { playerId: rival.profile.id, rank: 2, finished: true, finishTime: 65 },
  ] });
  await store.completeChampionship(guest.profile.id, 'discovery', 1, 2);
  const replay: ReplayData = { version: 1, id: 'guest-replay', trackId: 'lagon', trackRevision: TRACK_LAYOUT_REVISION,
    createdAt: now, durationMs: 60_000, season: seasonId(new Date(now)), ranked: true, drivers: [
      { playerId: guest.profile.id, name: guest.profile.name, color: '#ff0000', rank: 1, finished: true, finishTime: 60,
        frames: [[0, 0, 0, 0, 0, 0, 0], [60_000, 100, 100, 0, 0, 3, 16]] },
    ] };
  await store.saveReplay(replay);
  const before = store.getProfile(guest.profile.id)!;
  const legacy = JSON.parse(await readFile(join(directory, 'players.json'), 'utf8'));
  assert.equal(legacy.players[0].sessionTokenHashes, undefined, 'anonymous saves retain their historical shape');
  const migrated = await PlayerStore.open(directory, { now: () => now });
  const account = await migrated.registerAccount('PiloteClasse', 'secret123', guest.token, 'Nom sans effet');
  assert.deepEqual(account.profile, { ...before, username: 'PiloteClasse' });
  assert.equal(migrated.authenticate(guest.token)!.id, guest.profile.id, 'existing browser still plays as the same pilot');
  const reopened = await PlayerStore.open(directory, { now: () => now });
  assert.deepEqual((await reopened.loginAccount('PILOTECLASSE', 'secret123')).profile, account.profile);
  assert.deepEqual(await reopened.getReplay(replay.id), { ...replay, eventLevel: 0 });
  assert.equal(reopened.listReplays(account.profile.id).length, 1);
});

test('concurrent normalized and case-insensitive registrations have a single winner', async t => {
  const { store, directory } = await fixture(t);
  const results = await Promise.allSettled([' Alice ', 'alice', 'ＡＬＩＣＥ'].map(value => store.registerAccount(value, 'secret123')));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  for (const result of results) if (result.status === 'rejected') assert.ok(status(409)(result.reason));
  assert.equal(JSON.parse(await readFile(join(directory, 'players.json'), 'utf8')).players.length, 1);
  const accent = await store.registerAccount('Élodie', 'secret123');
  assert.equal((await store.loginAccount('éLODIE', 'secret123')).profile.id, accent.profile.id);
  await assert.rejects(store.registerAccount('éLODIE', 'another-secret'), status(409));
});

test('wrong passwords and unknown accounts fail without creating profiles or granting a session', async t => {
  const { store, directory } = await fixture(t);
  const account = await store.registerAccount('Alice', 'correct password');
  const before = await readFile(join(directory, 'players.json'), 'utf8');
  await assert.rejects(store.loginAccount('Alice', 'wrong-password'), status(401));
  await assert.rejects(store.loginAccount('Nobody', 'correct password'), status(401));
  await assert.rejects(store.loginAccount('Alice', 'short'), status(401));
  await assert.rejects(store.loginAccount({}, 'correct password'), status(401));
  assert.equal(await readFile(join(directory, 'players.json'), 'utf8'), before);
  assert.equal(store.authenticate(account.token)!.id, account.profile.id);
});

test('independent sessions survive restart and logout revokes only the selected token, including the last session', async t => {
  const { store, directory } = await fixture(t);
  const account = await store.registerAccount('Alice', 'secret123');
  const [phone, desktop] = await Promise.all([store.loginAccount('Alice', 'secret123'), store.loginAccount('alice', 'secret123')]);
  assert.equal(new Set([account.token, phone.token, desktop.token]).size, 3);
  const reopened = await PlayerStore.open(directory, { now: () => now });
  for (const session of [account, phone, desktop]) assert.equal(reopened.authenticate(session.token)!.id, account.profile.id);
  await reopened.logout(phone.token);
  assert.equal(reopened.authenticate(phone.token), null);
  assert.equal(reopened.authenticate(account.token)!.id, account.profile.id);
  assert.equal(reopened.authenticate(desktop.token)!.id, account.profile.id);
  await Promise.all([reopened.logout(account.token), reopened.logout(desktop.token)]);
  await reopened.logout(desktop.token);
  const loggedOut = await PlayerStore.open(directory, { now: () => now });
  for (const session of [account, phone, desktop]) assert.equal(loggedOut.authenticate(session.token), null);
  assert.equal((await loggedOut.loginAccount('Alice', 'secret123')).profile.id, account.profile.id);
});

test('session retention evicts the oldest tokens while allowing sixteen simultaneous logins', async t => {
  const { store, directory } = await fixture(t);
  const account = await store.registerAccount('Alice', 'secret123');
  const oldest = await store.loginAccount('Alice', 'secret123');
  const sessions = await Promise.all(Array.from({ length: 16 }, () => store.loginAccount('Alice', 'secret123')));
  assert.equal(store.authenticate(account.token), null); assert.equal(store.authenticate(oldest.token), null);
  for (const session of sessions) assert.equal(store.authenticate(session.token)!.id, account.profile.id);
  const saved = JSON.parse(await readFile(join(directory, 'players.json'), 'utf8'));
  assert.equal(saved.players[0].sessionTokenHashes.length, 15);
  const reopened = await PlayerStore.open(directory, { now: () => now });
  for (const session of sessions) assert.equal(reopened.authenticate(session.token)!.id, account.profile.id);
});

test('invalid inputs, expired linking tokens and already registered profiles never silently create or rebind accounts', async t => {
  const { store, directory } = await fixture(t);
  for (const value of ['', 'ab', 'a'.repeat(25), 'a b', 'a/b', 'a\nb', '../escape', {}, null])
    await assert.rejects(store.registerAccount(value, 'secret123'), status(400));
  for (const value of ['', '12345', 'a'.repeat(129), {}, null])
    await assert.rejects(store.registerAccount('ValidName', value), status(400));
  await assert.rejects(store.registerAccount('ValidName', 'secret123', 'bad-token'), status(401));
  await assert.rejects(store.registerAccount('ValidName', 'secret123', ''), status(401));
  await assert.rejects(store.registerAccount('ValidName', 'secret123', 'lk_' + 'a'.repeat(43)), status(401));
  const guest = await store.createPlayer('Invité');
  await store.logout(guest.token);
  await assert.rejects(store.registerAccount('ValidName', 'secret123', guest.token), status(401));
  const account = await store.registerAccount('Alice', 'secret123');
  await assert.rejects(store.registerAccount('Another', 'different-password', account.token), status(409));
  assert.equal((await store.loginAccount('Alice', 'secret123')).profile.id, account.profile.id);
  assert.equal(JSON.parse(await readFile(join(directory, 'players.json'), 'utf8')).players.length, 2);
});

test('an existing guest can register at capacity but a new account cannot exceed the player cap', async t => {
  const { store } = await fixture(t, { maxPlayers: 1 });
  const guest = await store.createPlayer('Invité');
  await assert.rejects(store.registerAccount('Another', 'secret123'), status(429));
  assert.equal((await store.registerAccount('Linked', 'secret123', guest.token)).profile.id, guest.profile.id);
});

test('malformed persisted credentials, duplicate usernames and invalid session records fail without erasing saves', async t => {
  const { store, directory } = await fixture(t);
  await store.registerAccount('Alice', 'secret123'); await store.registerAccount('Basile', 'secret123');
  const file = join(directory, 'players.json'), saved = JSON.parse(await readFile(file, 'utf8'));
  const alterations = [
    (data: typeof saved) => { delete data.players[0].passwordHash; },
    (data: typeof saved) => { delete data.players[0].username; },
    (data: typeof saved) => { data.players[0].username = ' Alice '; },
    (data: typeof saved) => { data.players[0].passwordHash.hash = 'plaintext'; },
    (data: typeof saved) => { data.players[0].passwordHash.salt = 'short'; },
    (data: typeof saved) => { data.players[0].passwordHash.N = 2 ** 30; },
    (data: typeof saved) => { data.players[1].username = 'aLiCe'; },
    (data: typeof saved) => { data.players[1].tokenHash = data.players[0].tokenHash; },
    (data: typeof saved) => { data.players[0].sessionTokenHashes = ['bad']; },
    (data: typeof saved) => { data.players[0].sessionTokenHashes = Array.from({ length: 16 }, (_, i) => i.toString(16).padStart(64, '0')); },
  ];
  for (const alter of alterations) {
    const data = structuredClone(saved); alter(data); const text = JSON.stringify(data);
    await writeFile(file, text);
    await assert.rejects(PlayerStore.open(directory, { now: () => now }), /illisible/);
    assert.equal(await readFile(file, 'utf8'), text);
  }
});

test('failed account commits leave the in-memory guest identity and progression untouched', async t => {
  const { store, directory } = await fixture(t);
  const guest = await store.createPlayer('Invité');
  await store.completeChampionship(guest.profile.id, 'discovery', 1, 2);
  const before = store.authenticate(guest.token);
  await rm(directory, { recursive: true });
  await assert.rejects(store.registerAccount('Alice', 'secret123', guest.token));
  assert.deepEqual(store.authenticate(guest.token), before);
  assert.equal(store.getProfile(guest.profile.id)!.username, undefined);
  await assert.rejects(store.loginAccount('Alice', 'secret123'), status(401));
});
