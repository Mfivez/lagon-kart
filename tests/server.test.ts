import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from 'colyseus.js';
import { neutralInput, type Kart, type World } from '../shared/game.js';
import type { RaceRoom } from '../server/RaceRoom.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown, label: string, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timeout: ${label}`);
    await pause(15);
  }
}

type Peer = { room: Room; world?: World; notices: string[]; leaveCode?: number };
function observe(room: Room): Peer {
  const peer: Peer = { room, notices: [] };
  room.onMessage('snapshot', (snapshot: { world: World }) => { peer.world = snapshot.world; });
  room.onMessage('notice', (notice: { message: string }) => peer.notices.push(notice.message));
  room.onLeave(code => { peer.leaveCode = code; });
  room.onError(() => {});
  return peer;
}
function me(peer: Peer): Kart | undefined { return peer.world?.players.find(kart => kart.id === peer.room.sessionId); }
const live = (peer: Peer) => matchMaker.getLocalRoomById(peer.room.roomId) as RaceRoom;

test('live HTTP and Colyseus room boundaries', { timeout: 30000 }, async t => {
  // Each node:test file runs in its own process. Shortening just this server's
  // reconnection window makes expiry observable without a 30-second test.
  process.env.RECONNECT_SECONDS = '1';
  process.env.MAX_PLAYERS = '8';
  process.env.MAX_ROOMS = '16';
  process.env.INPUT_TIMEOUT_MS = '250';
  process.env.SIMULATED_LATENCY_MS = '0';
  const { createGameServer } = await import('../server/app.js');
  const directory = await mkdtemp(join(tmpdir(), 'kart-server-test-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>Local test client</title>');
  await writeFile(join(directory, 'asset.js'), 'export const localAsset = true;');
  const { gameServer, httpServer } = createGameServer(directory);
  const peers: Peer[] = [];
  t.after(async () => {
    await Promise.allSettled(peers.filter(peer => peer.room.connection.isOpen).map(peer => peer.room.leave()));
    await gameServer.gracefullyShutdown(false);
    await rm(directory, { recursive: true, force: true });
  });
  await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const sdk = new Client(origin.replace('http:', 'ws:'));
  const create = async (practice = false, trackId = 'lagon') => {
    const peer = observe(await sdk.create('race', { name: 'Pilote', practice, trackId }));
    peers.push(peer);
    await until(() => me(peer), 'initial snapshot');
    return peer;
  };
  const enter = async (host: Peer, name = 'Invité') => {
    const peer = observe(await sdk.joinById(host.room.roomId, { name }));
    peers.push(peer);
    await until(() => me(peer), 'guest snapshot');
    return peer;
  };

  await t.test('HTTP serves local assets and direct links, bounds matchmaking and never advertises a private endpoint', async () => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { status: string }).status, 'ok');
    for (const [path, expected] of [['/', 200], ['/room/ABC234', 200], ['/asset.js', 200],
      ['/missing.js', 404], ['/matchmake/create/race', 405]] as const) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, expected);
      await response.arrayBuffer();
    }
    const oversized = await fetch(`${origin}/matchmake/create/race`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x'.repeat(5000) }) });
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();
    for (const body of ['[1,2]', '{broken', 'null']) {
      const response = await fetch(`${origin}/matchmake/create/race`, { method: 'POST', body });
      assert.match((await response.json() as { error: string }).error, /invalides/);
    }
    const reservation = await fetch(`${origin}/matchmake/create/race`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ practice: true }) });
    const seat = await reservation.json() as { room: { publicAddress?: string } };
    assert.equal(seat.room.publicAddress, undefined);
    const peer = observe(await sdk.consumeSeatReservation(seat as never));
    peers.push(peer);
    await assert.rejects(sdk.joinById(peer.room.roomId), /locked|full|complet/i);
    await assert.rejects(sdk.joinById('MISSING'), /not found|not defined|introuvable/i);
    await peer.room.leave();
  });

  await t.test('only a ready host starts; mid-race arrivals remain spectators', async () => {
    const host = await create(); const guest = await enter(host);
    guest.room.send('start');
    await until(() => guest.notices.some(message => message.includes('créateur')), 'non-host refusal');
    host.room.send('start');
    await until(() => host.notices.some(message => message.includes('prêts')), 'readiness refusal');
    assert.equal(host.world!.phase, 'lobby');
    host.room.send('ready', { ready: true }); guest.room.send('ready', { ready: true });
    await until(() => host.world!.players.every(kart => kart.ready), 'everyone ready');
    host.room.send('start');
    await until(() => host.world!.phase === 'countdown', 'start countdown');
    const spectator = await enter(host, 'Spectateur');
    assert.equal(me(spectator)!.spectator, true);
    const before = { x: me(spectator)!.x, z: me(spectator)!.z };
    // Server-side fixture skips elapsed countdown only. Browser commands still
    // pass through real HTTP reservations, WebSocket decoding and room handlers.
    live(host).world.phase = 'racing';
    spectator.room.send('input', { ...neutralInput(0, me(spectator)!.epoch), throttle: 1 });
    await pause(140);
    assert.equal(me(spectator)!.x, before.x); assert.equal(me(spectator)!.z, before.z);
    live(host).world.phase = 'finished';
    host.room.send('rematch');
    await until(() => spectator.world!.phase === 'lobby', 'spectator rematch');
    assert.equal(me(spectator)!.spectator, false);
    assert.ok(spectator.world!.players.every(kart => !kart.ready && !kart.finished && kart.lap === 0 && kart.item === ''));
  });

  await t.test('invalid state, stale epochs and duplicate commands are rejected; timeout neutralizes held throttle', async () => {
    const host = await create(true);
    live(host).world.phase = 'racing';
    const epoch = me(host)!.epoch;
    host.room.send('input', { ...neutralInput(10, epoch), throttle: 1 });
    await until(() => me(host)!.lastSeq === 10 && me(host)!.speed > 0, 'valid input acknowledgement');
    host.room.send('input', { ...neutralInput(11, epoch), throttle: 99 });
    host.room.send('input', { ...neutralInput(12, epoch), x: 50000, lap: 3, finished: true });
    host.room.send('input', { ...neutralInput(13, epoch - 1), throttle: 1 });
    host.room.send('input', { ...neutralInput(10, epoch), throttle: -1 });
    host.room.send('finish', { rank: 1, lap: 3 });
    await pause(170);
    assert.equal(me(host)!.lastSeq, 10);
    assert.equal(me(host)!.lap, 0); assert.equal(me(host)!.finished, false);
    const accelerating = me(host)!.speed;
    assert.ok(accelerating > 0);
    await pause(650);
    assert.equal(me(host)!.lastSeq, 10);
    assert.ok(me(host)!.speed < accelerating, 'expired throttle must coast down without another message');
    host.room.send('input', neutralInput(14, epoch));
    await until(() => me(host)!.lastSeq === 14, 'fresh command remains accepted after invalid messages');
  });

  await t.test('reconnection keeps identity, rotates token and invalidates all commands from the old connection', async () => {
    const host = await create(); const observer = await enter(host);
    live(host).world.phase = 'racing';
    const id = host.room.sessionId;
    const token = host.room.reconnectionToken;
    const oldEpoch = me(host)!.epoch;
    host.room.send('input', { ...neutralInput(8, oldEpoch), throttle: 1 });
    await until(() => me(host)!.lastSeq === 8, 'input before network loss');
    const beforeProgress = me(host)!.progress;
    await host.room.leave(false);
    await until(() => observer.world!.players.find(kart => kart.id === id)?.connected === false, 'peer observes network loss');
    assert.equal(observer.world!.hostId, observer.room.sessionId);
    const resumed = observe(await sdk.reconnect(token)); peers.push(resumed);
    await until(() => me(resumed)?.connected, 'reconnected snapshot');
    assert.equal(resumed.room.sessionId, id); assert.notEqual(resumed.room.reconnectionToken, token);
    assert.ok(me(resumed)!.epoch > oldEpoch);
    assert.ok(me(resumed)!.progress >= beforeProgress - 1);
    assert.equal(resumed.world!.players.filter(kart => kart.id === id).length, 1);
    resumed.room.send('input', { ...neutralInput(999, oldEpoch), throttle: 1 });
    await pause(100); assert.equal(me(resumed)!.lastSeq, -1);
    resumed.room.send('input', neutralInput(0, me(resumed)!.epoch));
    await until(() => me(resumed)!.lastSeq === 0, 'fresh epoch input starts cleanly at sequence zero');
  });

  await t.test('a quick item tap survives input coalescing while command bursts cannot accelerate server time', async () => {
    const host = await create(true);
    const server = live(host);
    server.world.phase = 'racing';
    const kart = server.world.players.find(player => player.id === host.room.sessionId)!;
    kart.item = 'turbo';
    const epoch = me(host)!.epoch;
    host.room.send('input', { ...neutralInput(0, epoch), use: true });
    host.room.send('input', neutralInput(1, epoch));
    await until(() => me(host)!.lastSeq === 1, 'both tap frames consumed');
    assert.equal(me(host)!.item, '');
    assert.ok(me(host)!.boost > 0, 'the rising edge must be applied even when key-up arrives before a simulation tick');
    kart.boost = 0; kart.speed = 0;
    for (let seq = 2; seq < 62; seq++) host.room.send('input', { ...neutralInput(seq, epoch), throttle: 1 });
    await until(() => me(host)!.lastSeq === 61, 'newest burst command acknowledged');
    assert.ok(me(host)!.speed < 8, 'sixty messages must not simulate sixty movement frames');
  });

  await t.test('reserved seats count toward eight, expiry retains DNF, host transfers and rematch frees abandoned slots', async () => {
    const host = await create();
    const guests: Peer[] = [];
    for (let i = 1; i < 8; i++) guests.push(await enter(host, `Pilote ${i + 1}`));
    await assert.rejects(sdk.joinById(host.room.roomId), /locked|full|complet/i);
    live(host).world.phase = 'racing';
    const dropped = guests[6]!;
    await dropped.room.leave(false);
    await until(() => host.world!.players.find(kart => kart.id === dropped.room.sessionId)?.connected === false, 'reserved disconnect');
    await assert.rejects(sdk.joinById(host.room.roomId), /locked|full|complet/i);
    await until(() => host.world!.players.find(kart => kart.id === dropped.room.sessionId)?.abandoned, 'reservation expires as DNF');
    const replacement = await enter(host, 'Remplaçant');
    assert.equal(me(replacement)!.spectator, true);
    assert.equal(replacement.world!.players.length, 9);
    assert.equal(replacement.world!.players.filter(kart => !kart.abandoned).length, 8);
    const oldHostId = host.room.sessionId;
    await host.room.leave();
    const successor = guests[0]!;
    await until(() => successor.world!.hostId === successor.room.sessionId, 'host transfers to next connected player');
    assert.equal(successor.world!.players.find(kart => kart.id === oldHostId)!.abandoned, true);
    live(successor).world.phase = 'finished';
    successor.room.send('rematch');
    await until(() => replacement.world!.phase === 'lobby', 'rematch');
    assert.equal(replacement.world!.players.length, 7);
    assert.ok(replacement.world!.players.every(kart => !kart.abandoned && !kart.spectator));
    assert.ok(!replacement.world!.players.some(kart => kart.id === oldHostId || kart.id === dropped.room.sessionId));
  });

  await t.test('circuit and tournament configuration is host-only, atomic, and isolated between rooms', async () => {
    const host = await create(); const guest = await enter(host);
    const other = await create(true, 'neon');
    const initial = JSON.stringify(host.world!.tournament);
    guest.room.send('configure', { mode: 'single', selection: 'manual', trackId: 'glacier' });
    await until(() => guest.notices.some(message => message.includes('créateur')), 'configuration requires host');
    assert.equal(host.world!.trackId, 'lagon');
    for (const payload of [
      { mode: 'single', selection: 'manual', trackId: 'unknown' },
      { mode: 'tournament', selection: 'manual', raceCount: 9, schedule: ['canyon'] },
      { mode: 'tournament', selection: 'manual', raceCount: 2, schedule: ['canyon', 'unknown'] },
      { mode: 'tournament', selection: 'manual', raceCount: 3, schedule: ['canyon', 'glacier'] },
      { mode: 'tournament', selection: 'random', raceCount: 2, trackPool: [] },
    ]) {
      const notices = host.notices.length;
      host.room.send('configure', payload);
      await until(() => host.notices.length > notices, 'invalid configuration refusal');
      assert.equal(JSON.stringify(host.world!.tournament), initial);
      assert.equal(host.world!.trackId, 'lagon');
    }
    host.room.send('ready', { ready: true }); guest.room.send('ready', { ready: true });
    await until(() => host.world!.players.every(kart => kart.ready), 'ready before changing circuit');
    const epoch = me(host)!.epoch;
    host.room.send('configure', { mode: 'tournament', selection: 'manual', raceCount: 2, schedule: ['canyon', 'glacier'] });
    await until(() => host.world!.trackId === 'canyon' && guest.world!.trackId === 'canyon', 'configured circuit on both clients');
    assert.deepEqual(host.world!.tournament.schedule, ['canyon', 'glacier']);
    assert.ok(host.world!.players.every(kart => kart.trackId === 'canyon' && !kart.ready));
    assert.ok(me(host)!.epoch > epoch);
    assert.equal(host.world!.tournament.standings.length, 2);
    assert.ok(host.world!.tournament.standings.every(row => row.points === 0));
    assert.equal(other.world!.trackId, 'neon');
    assert.equal(other.world!.tournament.mode, 'single');
    await assert.rejects(sdk.create('race', { trackId: 'unknown' }), /circuit.*inconnu/i);
  });

  await t.test('a series scores each round once, admits late entrants next round, and retains totals through reconnection', async () => {
    const host = await create(); const guest = await enter(host);
    host.room.send('configure', { mode: 'tournament', selection: 'manual', raceCount: 2, schedule: ['canyon', 'neon'] });
    await until(() => host.world!.trackId === 'canyon', 'series configured');
    host.room.send('ready', { ready: true }); guest.room.send('ready', { ready: true });
    await until(() => host.world!.players.every(kart => kart.ready), 'series participants ready');
    host.room.send('start');
    await until(() => host.world!.phase === 'countdown', 'series countdown');
    const late = await enter(host, 'Nouveau pilote');
    assert.equal(me(late)!.spectator, true);
    assert.equal(late.world!.tournament.standings.find(row => row.id === late.room.sessionId)!.points, 0);
    const finish = (peer: Peer, winner: string) => {
      const server = live(peer);
      server.world.phase = 'racing';
      const racers = server.world.players.filter(kart => !kart.spectator);
      racers.forEach(kart => {
        kart.finished = true; kart.lap = 3; kart.finishTime = kart.id === winner ? 60 : 70;
        kart.rank = kart.id === winner ? 1 : 2; kart.speed = 0;
      });
    };
    finish(host, host.room.sessionId);
    await until(() => host.world!.tournament.rounds.length === 1, 'first round scored');
    assert.equal(host.world!.phase, 'finished');
    assert.equal(host.world!.tournament.completed, false);
    assert.equal(host.world!.tournament.standings.find(row => row.id === host.room.sessionId)!.points, 15);
    const scored = JSON.stringify(host.world!.tournament);
    await pause(180);
    assert.equal(JSON.stringify(host.world!.tournament), scored, 'snapshot ticks cannot award points again');
    host.room.send('rematch');
    await until(() => host.notices.some(message => message.includes('tournoi continue')), 'unfinished series refuses full reset');
    assert.equal(host.world!.phase, 'finished');
    const token = host.room.reconnectionToken;
    const hostId = host.room.sessionId;
    await host.room.leave(false);
    await until(() => guest.world!.hostId === guest.room.sessionId, 'series host transfer');
    const resumed = observe(await sdk.reconnect(token)); peers.push(resumed);
    await until(() => me(resumed)?.connected, 'series reconnect');
    assert.equal(resumed.room.sessionId, hostId);
    assert.equal(resumed.world!.tournament.standings.find(row => row.id === hostId)!.points, 15);
    assert.equal(resumed.world!.tournament.rounds.length, 1);
    const oldEpoch = me(resumed)!.epoch;
    guest.room.send('nextRace');
    await until(() => late.world!.phase === 'lobby' && late.world!.trackId === 'neon' && resumed.world!.trackId === 'neon', 'next circuit lobby');
    assert.equal(me(late)!.spectator, false);
    assert.equal(late.world!.tournament.raceIndex, 1);
    assert.ok(late.world!.players.every(kart => !kart.ready && !kart.finished && kart.lap === 0 && kart.item === ''));
    assert.ok(me(resumed)!.epoch > oldEpoch);
    const before = JSON.stringify(guest.world!.tournament);
    guest.room.send('configure', { mode: 'single', selection: 'manual', trackId: 'lagon' });
    await until(() => guest.notices.some(message => message.includes('verrouillés')), 'series settings stay locked between rounds');
    assert.equal(JSON.stringify(guest.world!.tournament), before);
    // A final departure keeps its historical points even after next-race cleanup.
    await resumed.room.leave();
    await until(() => !guest.world!.players.some(kart => kart.id === hostId), 'departed driver leaves next-round lobby');
    assert.equal(guest.world!.tournament.standings.find(row => row.id === hostId)!.points, 15);
    finish(guest, guest.room.sessionId);
    await until(() => guest.world!.tournament.completed && late.world!.tournament.completed, 'second round completes series');
    assert.equal(guest.world!.tournament.rounds.length, 2);
    assert.deepEqual(guest.world!.tournament, late.world!.tournament);
    assert.equal(guest.world!.tournament.standings.find(row => row.id === guest.room.sessionId)!.points, 27);
    assert.equal(guest.world!.tournament.standings.find(row => row.id === late.room.sessionId)!.points, 12);
    const finished = JSON.stringify(guest.world!.tournament);
    guest.room.send('nextRace');
    await until(() => guest.notices.some(message => message.includes('tournoi est terminé')), 'complete series refuses extra race');
    assert.equal(JSON.stringify(guest.world!.tournament), finished);
    guest.room.send('rematch');
    await until(() => guest.world!.phase === 'lobby' && guest.world!.trackId === 'canyon', 'tournament rematch resets first circuit');
    assert.equal(guest.world!.tournament.raceIndex, 0);
    assert.equal(guest.world!.tournament.completed, false);
    assert.equal(guest.world!.tournament.rounds.length, 0);
    assert.ok(guest.world!.tournament.standings.every(row => row.points === 0 && row.wins === 0 && row.racesCompleted === 0));
    assert.ok(!guest.world!.tournament.standings.some(row => row.id === hostId));
  });

  await t.test('random schedules are drawn by the server and stay fixed while the series runs', async () => {
    const host = await create(true);
    host.room.send('configure', { mode: 'tournament', selection: 'random', raceCount: 8,
      trackPool: ['lagon', 'canyon', 'glacier', 'neon'] });
    await until(() => host.world!.tournament.mode === 'tournament', 'random series configured');
    const schedule = [...host.world!.tournament.schedule];
    assert.equal(schedule.length, 8);
    assert.equal(new Set(schedule.slice(0, 4)).size, 4);
    assert.equal(new Set(schedule.slice(4)).size, 4);
    host.room.send('ready', { ready: true });
    await until(() => me(host)!.ready, 'solo series ready');
    host.room.send('start');
    await until(() => host.world!.phase === 'countdown', 'random series begins');
    host.room.send('configure', { mode: 'tournament', selection: 'random', raceCount: 2, trackPool: ['neon'] });
    await until(() => host.notices.some(message => message.includes('verrouillés')), 'random program cannot reroll after start');
    assert.deepEqual(host.world!.tournament.schedule, schedule);
    assert.equal(host.world!.trackId, schedule[0]);
  });

  await t.test('oversized WebSocket messages and sustained command bursts close the connection', async () => {
    const oversized = await create(true);
    oversized.room.send('input', { ...neutralInput(0, me(oversized)!.epoch), padding: 'x'.repeat(4096) });
    await until(() => oversized.leaveCode !== undefined, 'WebSocket payload limit');
    assert.equal(oversized.leaveCode, 1009);
    const flooded = await create(true);
    for (let i = 0; i < 140; i++) flooded.room.send('input', neutralInput(i, me(flooded)!.epoch));
    await until(() => flooded.leaveCode !== undefined, 'WebSocket message frequency limit');
    assert.equal(flooded.leaveCode, 4008);
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    await health.arrayBuffer();
  });
});
