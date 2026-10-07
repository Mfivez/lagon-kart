import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, type Room } from 'colyseus.js';
import type { PlayerProfile } from '../shared/progression.js';
import type { PresenceSnapshot } from '../shared/presence.js';

test('presence API tracks home, real rooms and ranked without leaking private identity data', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-presence-'));
  const previousPlayers = process.env.PLAYER_DATA_DIR, previousTracks = process.env.CUSTOM_TRACK_DATA_DIR;
  process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
  const { createGameServer } = await import('../server/app.js');
  const { rankedQueue } = await import('../server/career.js');
  const { gameServer, httpServer, ready } = createGameServer(directory);
  const rooms: Room[] = [];
  t.after(async () => {
    await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave()));
    await gameServer.gracefullyShutdown(false);
    if (previousPlayers === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousPlayers;
    if (previousTracks === undefined) delete process.env.CUSTOM_TRACK_DATA_DIR; else process.env.CUSTOM_TRACK_DATA_DIR = previousTracks;
    await rm(directory, { recursive: true, force: true });
  });
  await ready; await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`, sdk = new Client(origin.replace(/^http/, 'ws'));
  const request = async (path: string, method = 'GET', token = '', body?: unknown, extra: Record<string, string> = {}) => {
    const response = await fetch(origin + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: await response.json() as any };
  };
  const snapshot = async () => (await request('/api/presence')).data as PresenceSnapshot;
  const until = async (predicate: () => Promise<boolean>) => {
    const end = Date.now() + 6000;
    while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.fail('Expected presence state did not arrive');
  };
  const alice = (await request('/api/profile', 'POST', '', { name: 'Alice' })).data as { token: string; profile: PlayerProfile };
  const bob = (await request('/api/profile', 'POST', '', { name: 'Bob' })).data as typeof alice;
  const aliceTab = randomUUID(), aliceOtherTab = randomUUID(), bobTab = randomUUID();

  await t.test('authenticated heartbeats count unique profiles and ignore forged public names/statuses', async () => {
    assert.deepEqual(await snapshot(), { players: [], connected: 0, searchingRanked: 0 });
    await request('/api/presence', 'POST', alice.token, { clientId: aliceTab, name: 'Forged', playerId: bob.profile.id, status: 'ranked-search' });
    await request('/api/presence', 'POST', alice.token, { clientId: aliceOtherTab });
    const response = await request('/api/presence', 'POST', bob.token, { clientId: bobTab }, { Origin: origin });
    assert.equal(response.status, 200); assert.equal(response.data.connected, 2); assert.equal(response.data.searchingRanked, 0);
    assert.deepEqual(response.data.players.map((player: any) => player.name), ['Alice', 'Bob']);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('access-control-allow-origin'), null);
    const serialized = JSON.stringify(response.data);
    for (const secret of [alice.token, bob.token, aliceTab, bobTab, 'username', 'tokenHash', 'password', 'mmr']) assert.ok(!serialized.includes(secret));
    await request('/api/presence', 'DELETE', bob.token, { clientId: aliceTab }); assert.equal((await snapshot()).connected, 2);
    await request('/api/presence', 'DELETE', alice.token, { clientId: aliceTab }); assert.equal((await snapshot()).connected, 2);
  });

  await t.test('the public panel reads actual queue searches, cancellations and reservations', async () => {
    await request('/api/ranked', 'POST', alice.token);
    assert.equal((await snapshot()).searchingRanked, 1);
    assert.equal((await snapshot()).players.find(player => player.id === alice.profile.id)?.status, 'ranked-search');
    await request('/api/ranked', 'DELETE', alice.token); assert.equal((await snapshot()).searchingRanked, 0);
    // Deterministic queue time only; no room or gameplay mutation endpoint exists.
    const now = Date.now(); rankedQueue.join(alice.profile.id, 800, now - 3500); rankedQueue.join(bob.profile.id, 800, now - 3500);
    const match = rankedQueue.popMatches(now)[0]!;
    assert.equal((await snapshot()).searchingRanked, 2);
    rankedQueue.assignMatch(match.id, 'RESERVE01');
    assert.equal((await snapshot()).searchingRanked, 0);
    assert.ok((await snapshot()).players.every(player => player.status === 'ranked-ready'));
    rankedQueue.cancel(alice.profile.id); rankedQueue.cancel(bob.profile.id);
  });

  await t.test('connected human rooms count without browser heartbeats, bots are excluded and game overrides home', async () => {
    const room = await sdk.create('race', { token: alice.token, name: 'Alice', practice: true }); rooms.push(room);
    room.onMessage('*', () => {});
    await until(async () => (await snapshot()).players.find(player => player.id === alice.profile.id)?.status === 'lobby');
    room.send('configure', { cpuCount: 7 });
    const { matchMaker } = await import('@colyseus/core');
    await until(async () => (matchMaker.getLocalRoomById(room.roomId) as import('../server/RaceRoom.js').RaceRoom).world.players.filter(kart => kart.cpu).length === 7);
    await request('/api/presence', 'DELETE', alice.token, { clientId: aliceOtherTab });
    assert.equal((await snapshot()).connected, 2);
    room.send('ready', { ready: true }); room.send('start', {});
    await until(async () => (await snapshot()).players.find(player => player.id === alice.profile.id)?.status === 'practice');
    assert.equal((await snapshot()).connected, 2);
    await room.leave();
    await until(async () => (await snapshot()).connected === 1);
  });

  await t.test('a tab changing identity removes its old home profile without touching another device', async () => {
    const charlie = (await request('/api/profile', 'POST', '', { name: 'Charlie' })).data as typeof alice;
    await request('/api/presence', 'POST', charlie.token, { clientId: bobTab });
    assert.deepEqual((await snapshot()).players.map(player => player.name), ['Charlie']);
    await request('/api/presence', 'DELETE', bob.token, { clientId: bobTab }); assert.equal((await snapshot()).connected, 1);
    await request('/api/presence', 'DELETE', charlie.token, { clientId: bobTab }); assert.equal((await snapshot()).connected, 0);
  });

  await t.test('invalid auth, methods, origins and client IDs cannot add users to the list', async () => {
    assert.equal((await request('/api/presence', 'POST', '', { clientId: randomUUID() })).status, 401);
    assert.equal((await request('/api/presence', 'POST', alice.profile.id, { clientId: randomUUID() })).status, 401);
    assert.equal((await request('/api/presence', 'POST', alice.token, { clientId: randomUUID() }, { Origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await request('/api/presence', 'POST', alice.token, { clientId: randomUUID() }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('/api/presence', 'PATCH', alice.token, {})).status, 405);
    assert.equal((await request('/api/presence', 'POST', alice.token, { clientId: 'not-a-session' })).status, 400);
    assert.equal((await request('/api/presence', 'POST', alice.token, { clientId: randomUUID(), padding: 'x'.repeat(5000) })).status, 400);
    assert.equal((await snapshot()).connected, 0);
  });
});
