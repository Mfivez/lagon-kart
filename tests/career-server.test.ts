import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from 'colyseus.js';
import type { PlayerProfile } from '../shared/progression.js';
import { DEFAULT_BUILD } from '../shared/garage.js';
import { getTrack, TOTAL_LAPS, type Kart, type World } from '../shared/game.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { PlayerStore } from '../server/player-store.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown | Promise<unknown>, description: string, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw new Error(`Timeout: ${description}`); await pause(30); }
}
interface Account { token: string; profile: PlayerProfile }
interface Peer { room: Room; world?: World; notices: string[]; snapshots: string[]; profileUpdates: number[] }
function observe(room: Room): Peer {
  const peer: Peer = { room, notices: [], snapshots: [], profileUpdates: [] };
  room.onMessage('snapshot', (value: { world: World }) => { peer.world = value.world; peer.snapshots.push(JSON.stringify(value)); if (peer.snapshots.length > 20) peer.snapshots.shift(); });
  room.onMessage('notice', (value: { message: string }) => peer.notices.push(value.message));
  room.onMessage('profile-updated', (value: { round: number }) => peer.profileUpdates.push(value.round));
  room.onError(() => {}); return peer;
}
const me = (peer: Peer): Kart | undefined => peer.world?.players.find(player => player.id === peer.room.sessionId);
const live = (peer: Peer) => matchMaker.getLocalRoomById(peer.room.roomId) as RaceRoom;

test('career API and authoritative room integration', { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'kart-career-server-'));
  process.env.PLAYER_DATA_DIR = join(directory, 'profiles');
  process.env.MAX_ROOMS = '16'; process.env.MAX_PLAYERS = '8'; process.env.RECONNECT_SECONDS = '1';
  const { createGameServer } = await import('../server/app.js');
  const { playerStore, INTERNAL_ROOM_KEY, rankedQueue } = await import('../server/career.js');
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Private career test</title>');
  const { gameServer, httpServer } = createGameServer(directory), peers: Peer[] = [];
  t.after(async () => {
    await Promise.allSettled(peers.filter(peer => peer.room.connection.isOpen).map(peer => peer.room.leave()));
    await gameServer.gracefullyShutdown(false);
    await (await playerStore()).flush(); await rm(directory, { recursive: true, force: true });
  });
  await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`, sdk = new Client(origin.replace('http:', 'ws:'));
  async function request(path: string, method = 'GET', token = '', body?: unknown) {
    const response = await fetch(origin + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as any };
  }
  async function account(name: string): Promise<Account> {
    const result = await request('/api/profile', 'POST', '', { name, mmr: 9999, careerLevel: 3, completedChampionships: ['masters'] });
    assert.equal(result.status, 201); return result.body as Account;
  }
  async function create(options: Record<string, unknown> = {}): Promise<Peer> {
    const peer = observe(await sdk.create('race', options)); peers.push(peer); await until(() => me(peer), 'initial room snapshot'); return peer;
  }
  async function enter(roomId: string, options: Record<string, unknown> = {}): Promise<Peer> {
    const peer = observe(await sdk.joinById(roomId, options)); peers.push(peer); await until(() => me(peer), 'joined room snapshot'); return peer;
  }
  async function match(a: Account, b: Account, additional: Account[] = []) {
    const accounts = [a, b, ...additional];
    for (const account of accounts) assert.equal((await request('/api/ranked', 'POST', account.token)).body.state, 'queued');
    let states: any[] = [];
    await until(async () => {
      states = await Promise.all(accounts.map(async account => (await request('/api/ranked', 'GET', account.token)).body));
      return states.every(state => state.state === 'matched');
    }, 'authenticated profiles matched after queue wait');
    assert.equal(new Set(states.map(state => state.roomId)).size, 1); return states[0].roomId as string;
  }
  // This intentionally accelerates only private server fixtures. It does not
  // count as a driven race and provides no mutation endpoint in the product.
  async function finishFixture(peer: Peer) {
    const room = live(peer); room.world.phase = 'racing'; room.world.raceTime = 60;
    await pause(100); // Let the real recorder sample an ordinary pre-finish frame.
    room.world.players.filter(player => !player.spectator).forEach((player, index) => {
      player.finished = true; player.lap = TOTAL_LAPS; player.finishTime = 50 + index;
      player.progress = getTrack(room.world.trackId).length * TOTAL_LAPS; player.speed = 0;
    });
    await until(() => peer.world?.phase === 'finished', 'fixture race classified');
  }

  await t.test('HTTP identities reject forged progression and protect authentication secrets', async () => {
    const a = await account('Alice');
    assert.equal(a.profile.careerLevel, 0); assert.equal(a.profile.mmr, 800); assert.deepEqual(a.profile.completedChampionships, []);
    assert.equal((await request('/api/me')).status, 401);
    assert.equal((await request('/api/me', 'GET', a.profile.id)).status, 401);
    assert.equal((await request('/api/me', 'GET', a.token)).body.profile.id, a.profile.id);
    const updated = await request('/api/me', 'PATCH', a.token, { name: 'Alice 2', mmr: 9999, careerLevel: 3, id: 'other' });
    assert.equal(updated.body.profile.name, 'Alice 2'); assert.equal(updated.body.profile.mmr, 800); assert.equal(updated.body.profile.careerLevel, 0);
    const stored = await readFile(join(directory, 'profiles', 'players.json'), 'utf8');
    assert.ok(!stored.includes(a.token)); assert.ok(!JSON.stringify(updated.body).includes('tokenHash'));
  });

  await t.test('rooms bind identity to the token, normalise model/build choices, and reject duplicate identities', async () => {
    const a = await account('Constructeur'), b = await account('Autre');
    const host = await create({ token: a.token, playerId: b.profile.id, careerLevel: 3, name: 'Constructeur', modelId: 'missing-model',
      build: { ...DEFAULT_BUILD, engine: 'velocity', wing: 'streamlined' } });
    assert.equal(me(host)!.playerId, a.profile.id); assert.equal(me(host)!.careerLevel, 0);
    assert.equal(me(host)!.modelId, 'zsky'); assert.deepEqual(me(host)!.build, DEFAULT_BUILD);
    await assert.rejects(sdk.joinById(host.room.roomId, { token: a.token }), /déjà|profil/i);
    await assert.rejects(sdk.joinById(host.room.roomId, { token: b.profile.id }), /invalide/i);
    host.room.send('profile', { playerId: b.profile.id, careerLevel: 3, modelId: 'retro', build: { ...DEFAULT_BUILD, tires: 'snow' } });
    await until(() => me(host)?.modelId === 'retro', 'known model accepted');
    assert.equal(me(host)!.playerId, a.profile.id); assert.equal(me(host)!.build.tires, 'road');
    for (const snapshot of host.snapshots) { assert.ok(!snapshot.includes(a.token)); assert.ok(!snapshot.includes(INTERNAL_ROOM_KEY)); assert.ok(!snapshot.includes('tokenHash')); }
    await host.room.leave();
  });

  await t.test('client-created rooms cannot forge ranked authority; all matched profiles must join before starting', async () => {
    const a = await account('Classé A'), b = await account('Classé B'), c = await account('Classé C'), stranger = await account('Intrus');
    const forged = await create({ token: stranger.token, ranked: true, rankedPlayers: [stranger.profile.id], internalKey: 'forged' });
    assert.equal(forged.world!.ranked, false); await forged.room.leave();
    const roomId = await match(a, b, [c]);
    await assert.rejects(sdk.joinById(roomId, { token: stranger.token }), /réservé|matchmaking/i);
    await assert.rejects(sdk.joinById(roomId, {}), /profil/i);
    const host = await enter(roomId, { token: a.token }), guest = await enter(roomId, { token: b.token });
    assert.equal(host.world!.ranked, true); assert.equal(host.world!.tournament.raceCount, 2);
    assert.equal((await request('/api/ranked', 'POST', a.token)).status, 409);
    host.room.send('configure', { mode: 'single', selection: 'manual', trackId: 'lagon' });
    await until(() => host.notices.some(notice => notice.includes('fixé')), 'ranked program cannot be changed');
    host.room.send('ready', { ready: true }); guest.room.send('ready', { ready: true });
    await until(() => host.world?.players.every(player => player.ready), 'first two ranked drivers ready');
    host.room.send('start', {}); await pause(100);
    assert.equal(host.world!.phase, 'lobby', 'manual start cannot exclude another reserved player');
    const third = await enter(roomId, { token: c.token }); third.room.send('ready', { ready: true });
    await until(() => host.world?.phase === 'countdown', 'ranked starts once all reserved drivers are ready');
    const store = await playerStore(), recordRace = store.recordRace.bind(store);
    let releaseSave!: () => void;
    const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
    let saveStarted = false;
    const heldSave = t.mock.method(store, 'recordRace', async (race: Parameters<PlayerStore['recordRace']>[0]) => { saveStarted = true; await saveGate; return recordRace(race); });
    try {
      await finishFixture(host);
      await until(() => saveStarted, 'race persistence entered');
      assert.deepEqual(host.profileUpdates, [], 'finished snapshot cannot advertise an unsaved profile');
      assert.equal((await request('/api/me', 'GET', a.token)).body.profile.mmr, 800);
      releaseSave();
      await until(() => host.profileUpdates.includes(host.world!.round), 'saved profile notification received');
      assert.equal((await request('/api/me', 'GET', a.token)).body.profile.mmr, 820, 'notification follows durable MMR update');
    } finally { releaseSave(); heldSave.mock.restore(); }
    await until(async () => (await request('/api/me', 'GET', a.token)).body.profile.ranked.races === 1, 'ranked MMR persisted');
    assert.equal((await request('/api/me', 'GET', a.token)).body.profile.mmr, 820);
    assert.equal((await request('/api/me', 'GET', b.token)).body.profile.mmr, 800);
    assert.equal((await request('/api/me', 'GET', c.token)).body.profile.mmr, 780);
    const leaderboard = await request('/api/leaderboard');
    assert.ok(leaderboard.body.entries.some((entry: { playerId: string }) => entry.playerId === a.profile.id));
    assert.ok(!JSON.stringify(leaderboard.body).includes(a.token));
    await host.room.leave(); await guest.room.leave(); await third.room.leave();
  });

  await t.test('queue cancellation invalidates a matched seat, and cancellation before matching removes the queue entry', async () => {
    const a = await account('Annulation A'), b = await account('Annulation B');
    await request('/api/ranked', 'POST', a.token);
    assert.equal((await request('/api/ranked', 'DELETE', a.token)).body.state, 'idle');
    assert.equal(rankedQueue.poll(a.profile.id).state, 'idle');
    const roomId = await match(a, b);
    await request('/api/ranked', 'DELETE', a.token);
    assert.equal((await request('/api/ranked', 'GET', b.token)).body.state, 'queued', 'other matched driver returns to queue');
    await assert.rejects(sdk.joinById(roomId, { token: a.token }), /réserv|annul|matchmaking|expir/i);
    await request('/api/ranked', 'DELETE', b.token);
  });

  await t.test('championship locks, server-awarded garage tiers, stats and human replays survive persistence', async () => {
    const a = await account('Carrière'), host = await create({ token: a.token, name: 'Carrière' });
    host.room.send('configure', { championshipId: 'masters' });
    await until(() => host.notices.some(notice => notice.includes('verrouillé')), 'advanced championship denied');
    assert.equal(host.world!.championshipId, '');
    host.room.send('configure', { championshipId: 'discovery' });
    await until(() => host.world?.championshipId === 'discovery' && host.world.players.length === 4, 'introductory cup configured with CPU');
    assert.equal(host.world!.eventLevel, 0); assert.equal(host.world!.players.filter(player => player.cpu).length, 3);
    host.room.send('configure', { eventLevel: 3 }); await pause(100);
    assert.equal(host.world!.eventLevel, 0, 'the cup fixes its event complexity');
    for (let race = 0; race < 2; race++) {
      host.room.send('ready', { ready: true }); await until(() => me(host)?.ready, 'human ready'); host.room.send('start', {});
      await until(() => host.world?.phase === 'countdown', 'championship countdown');
      await finishFixture(host);
      await until(async () => (await request('/api/me', 'GET', a.token)).body.profile.stats.races === race + 1, 'career statistics persisted');
      if (race === 0) { host.room.send('nextRace', {}); await until(() => host.world?.phase === 'lobby' && host.world.tournament.raceIndex === 1, 'next cup race'); }
    }
    await until(async () => (await request('/api/me', 'GET', a.token)).body.profile.careerLevel === 1, 'cup reward unlocks garage');
    const saved = (await request('/api/me', 'GET', a.token)).body.profile as PlayerProfile;
    assert.equal(saved.stats.races, 2); assert.equal(saved.xp, 240); assert.deepEqual(saved.completedChampionships, ['discovery']);
    const list = (await request('/api/replays', 'GET', a.token)).body.replays;
    assert.equal(list.length, 2);
    const data = (await request(`/api/replays/${list[0].id}`)).body.replay;
    assert.equal(data.drivers.length, 1); assert.equal(data.drivers[0].playerId, a.profile.id);
    assert.equal(data.drivers[0].frames.at(-1)[5], 3); assert.ok(!JSON.stringify(data).includes(a.token));
    assert.equal((await request('/api/replays/not-a-replay')).status, 404);
    assert.equal((await request('/api/ghost?track=lagon')).body.ghost.trackId, 'lagon');
    const reloaded = await PlayerStore.open(join(directory, 'profiles'));
    assert.equal(reloaded.authenticate(a.token)?.careerLevel, 1); assert.equal(reloaded.authenticate(a.token)?.stats.races, 2);
    host.room.send('rematch', {}); await until(() => host.world?.phase === 'lobby', 'career rematch');
    host.room.send('profile', { build: { ...DEFAULT_BUILD, engine: 'sprint' } });
    await until(() => me(host)?.build.engine === 'sprint', 'earned garage part accepted');
    await host.room.leave();
  });

  await t.test('teams fill eight seats, preserve a human host and stay separate from the career championship', async () => {
    const a = await account('Équipe'), b = await account('Coéquipier');
    const host = await create({ token: a.token }), guest = await enter(host.room.roomId, { token: b.token });
    host.room.send('configure', { teamMode: true });
    await until(() => host.world?.teamMode && host.world.players.length === 8, 'four versus four grid');
    assert.equal(host.world!.championshipId, ''); assert.equal(host.world!.tournament.mode, 'tournament');
    assert.equal(host.world!.players.filter(player => player.team === 0).length, 4); assert.equal(host.world!.players.filter(player => player.team === 1).length, 4);
    assert.equal(host.world!.players.filter(player => player.cpu).length, 6);
    await host.room.leave(); await until(() => guest.world?.hostId === guest.room.sessionId, 'human host transfer');
    assert.equal(guest.world!.players.find(player => player.id === guest.world!.hostId)!.cpu, false);
    await guest.room.leave();
  });
});
