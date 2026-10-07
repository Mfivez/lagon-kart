import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client, type Room } from 'colyseus.js';
import { neutralInput, type World } from '../shared/game.js';
import type { RaceRoom } from '../server/RaceRoom.js';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => unknown, label: string) {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await pause(15);
  }
}
type Peer = { room: Room; world?: World };
function observe(room: Room): Peer {
  const peer: Peer = { room };
  room.onMessage('snapshot', (message: { world: World }) => { peer.world = message.world; });
  room.onMessage('notice', () => {});
  return peer;
}

// This is a transport/progression test: only countdowns and finish fixtures are
// shortened on its isolated server. scripts/tournament-check.ts drives full races.
test('live tournaments continue beyond two rounds and stop at their selected count', { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tournament-continuation-'));
  const previousPlayers = process.env.PLAYER_DATA_DIR, previousTracks = process.env.CUSTOM_TRACK_DATA_DIR;
  process.env.PLAYER_DATA_DIR = join(directory, 'players');
  process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
  const { createGameServer } = await import('../server/app.js');
  const { gameServer, httpServer, ready } = createGameServer(directory);
  const peers: Peer[] = [];
  t.after(async () => {
    await Promise.allSettled(peers.filter(peer => peer.room.connection.isOpen).map(peer => peer.room.leave()));
    await gameServer.gracefullyShutdown(false);
    if (previousPlayers === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousPlayers;
    if (previousTracks === undefined) delete process.env.CUSTOM_TRACK_DATA_DIR; else process.env.CUSTOM_TRACK_DATA_DIR = previousTracks;
    await rm(directory, { recursive: true, force: true });
  });
  await ready; await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const sdk = new Client(`ws://127.0.0.1:${address.port}`);
  const host = observe(await sdk.create('race', { name: 'Hôte tournoi' })); peers.push(host);
  const guest = observe(await sdk.joinById(host.room.roomId, { name: 'Invité tournoi' })); peers.push(guest);
  await until(() => peers.every(peer => peer.world?.players.length === 2), 'both clients joined');
  const live = matchMaker.getLocalRoomById(host.room.roomId) as RaceRoom;
  assert.ok(live);

  async function playConfiguredRounds(expectedCount: number) {
    const schedule = [...host.world!.tournament.schedule];
    assert.equal(schedule.length, expectedCount);
    for (let round = 0; round < expectedCount; round++) {
      await until(() => peers.every(peer => peer.world?.phase === 'lobby' && peer.world.tournament.raceIndex === round), `round ${round + 1} lobby`);
      const before = host.world!;
      assert.equal(before.trackId, schedule[round]);
      assert.equal(before.tournament.raceCount, expectedCount);
      assert.equal(before.tournament.rounds.length, round);
      assert.equal(before.tournament.completed, false);
      assert.ok(before.players.every(kart => kart.lap === 0 && !kart.finished && !kart.ready));
      const epochs = new Map(before.players.map(kart => [kart.id, kart.epoch]));
      for (const peer of peers) peer.room.send('ready', { ready: true });
      await until(() => peers.every(peer => peer.world?.players.every(kart => kart.ready)), 'both racers ready');
      host.room.send('start');
      await until(() => live.world.phase === 'countdown', 'countdown begins');
      live.world.countdown = .01;
      await until(() => peers.every(peer => peer.world?.phase === 'racing'), `race ${round + 1} starts`).catch(error => {
        console.error({ serverPhase: live.world.phase, countdown: live.world.countdown,
          clientPhases: peers.map(peer => peer.world?.phase) });
        throw error;
      });
      for (const peer of peers) peer.room.send('input', { ...neutralInput(0, epochs.get(peer.room.sessionId)!), throttle: 1 });
      await until(() => peers.every(peer => peer.world?.players.every(kart => kart.lastSeq === 0)), 'new round accepts fresh input sequence');
      live.world.players.forEach((kart, index) => { kart.finished = true; kart.lap = 3; kart.finishTime = 60 + index; });
      await until(() => peers.every(peer => peer.world?.phase === 'finished' && peer.world.tournament.rounds.length === round + 1), 'finish fixture recorded');
      const results = host.world!.tournament;
      assert.equal(results.completed, round === expectedCount - 1);
      assert.deepEqual(results.schedule, schedule);
      assert.ok(results.standings.every(driver => driver.racesCompleted === round + 1));
      assert.equal(results.standings.reduce((sum, driver) => sum + driver.points, 0), 27 * (round + 1));
      assert.deepEqual(guest.world!.tournament, results);
      if (round < expectedCount - 1) {
        host.room.send('nextRace');
        await until(() => peers.every(peer => peer.world?.phase === 'lobby' && peer.world.tournament.raceIndex === round + 1), 'next race available');
        assert.ok(host.world!.players.every(kart => kart.epoch > epochs.get(kart.id)!));
      }
    }
    host.room.send('nextRace'); await pause(100);
    assert.equal(host.world!.phase, 'finished');
    assert.equal(host.world!.tournament.raceIndex, expectedCount - 1);
  }

  await t.test('four manually selected circuits reach the fourth podium', async () => {
    host.room.send('configure', { mode: 'tournament', selection: 'manual', raceCount: 4,
      schedule: ['lagon', 'canyon', 'glacier', 'neon'] });
    await until(() => host.world?.tournament.raceCount === 4, 'four-race schedule applied');
    await playConfiguredRounds(4);
  });
  await t.test('eight random races from two circuits still run eight rounds after a rematch', async () => {
    host.room.send('rematch');
    await until(() => peers.every(peer => peer.world?.phase === 'lobby' && peer.world.tournament.rounds.length === 0), 'rematch clears scores');
    host.room.send('configure', { mode: 'tournament', selection: 'random', raceCount: 8, trackPool: ['lagon', 'neon'] });
    await until(() => peers.every(peer => peer.world?.tournament.raceCount === 8), 'eight-race schedule applied');
    assert.equal(new Set(host.world!.tournament.schedule).size, 2);
    await playConfiguredRounds(8);
  });
});
