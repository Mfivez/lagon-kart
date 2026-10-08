import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { type Kart, type World } from '../shared/game.js';

const origin = process.env.BASE_URL?.replace(/\/$/, '');
assert.ok(origin && /^https?:\/\//.test(origin), 'BASE_URL must explicitly select the server.');
const reportPath = resolve(process.env.REPORT_FILE ?? 'docs/boost-normal-race/network-validation.json');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Peer = { room: Room; world?: World; seq: number; epoch: number; snapshots: number; commands: number };
type SpeedSample = { speed: number; boost: number; surface: string; stun: number; item: string; itemCharges: number };
type Activation = { source: 'pad' | 'item'; id: string; driver: string; lap: number; raceTime: number;
  before: SpeedSample; firstObserved: SpeedSample; maximumBoostedSpeed: number; observedThroughRaceTime: number };
const peers: Peer[] = [], notices: string[] = [], errors: string[] = [];
const activations: Activation[] = [], previous = new Map<string, Kart>(), items = new Set<string>();
let timer: ReturnType<typeof setInterval> | undefined;
let maximumSpeed = 0, maximumBoost = 0, result = 'failed', failure = '', stoppedBecause = '';
let initialHealth: unknown, finalHealth: unknown, roomId = '', lastWorld: World | undefined;
const startedAt = new Date().toISOString();
function sample(kart: Kart): SpeedSample {
  return { speed: kart.speed, boost: kart.boost, surface: kart.surface, stun: kart.stun,
    item: kart.item, itemCharges: kart.itemCharges };
}
function observe(world: World) {
  lastWorld = world;
  if (world.phase !== 'racing') return;
  for (const kart of world.players) {
    maximumSpeed = Math.max(maximumSpeed, kart.speed);
    maximumBoost = Math.max(maximumBoost, kart.boost);
    if (kart.item) items.add(kart.item);
    const before = previous.get(kart.id);
    if (before) {
      const add = (source: Activation['source'], id: string) => activations.push({
        source, id, driver: kart.id, lap: kart.lap, raceTime: world.raceTime,
        before: sample(before), firstObserved: sample(kart),
        maximumBoostedSpeed: kart.boost > 0 ? kart.speed : 0, observedThroughRaceTime: world.raceTime,
      });
      for (const [id, lap] of Object.entries(kart.padLaps)) if (before.padLaps[id] !== lap) add('pad', id);
      if ((before.item === 'turbo' && kart.item !== 'turbo' || before.item === 'tripleTurbo' &&
        (kart.item !== 'tripleTurbo' || kart.itemCharges < before.itemCharges)) && kart.boost > 0 &&
        kart.boost > before.boost - .15) add('item', before.item);
    }
    for (const activation of activations) if (activation.driver === kart.id &&
      world.raceTime - activation.raceTime <= 2.5) {
      if (kart.boost > 0) activation.maximumBoostedSpeed = Math.max(activation.maximumBoostedSpeed, kart.speed);
      activation.observedThroughRaceTime = world.raceTime;
    }
    previous.set(kart.id, kart);
  }
}
function attach(room: Room, observer = false): Peer {
  const peer: Peer = { room, seq: 0, epoch: -1, snapshots: 0, commands: 0 };
  peers.push(peer);
  room.onMessage('snapshot', ({ world }: { world: World }) => {
    peer.world = world; peer.snapshots++;
    if (observer) observe(world);
  });
  room.onMessage('notice', ({ message }: { message: string }) => notices.push(message));
  room.onError((code, message) => errors.push(`Colyseus ${code}: ${message ?? ''}`));
  return peer;
}
async function until(condition: () => boolean, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await pause(50);
  }
}

try {
  const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200); initialHealth = await response.json();
  const host = attach(await new Client(origin.replace(/^http/, 'ws')).create('race', {
    name: 'Vérif turbo réseau 1', practice: false, trackId: 'lagon',
  }), true);
  roomId = host.room.roomId;
  attach(await new Client(origin.replace(/^http/, 'ws')).joinById(roomId, { name: 'Vérif turbo réseau 2' }));
  await until(() => peers.every(peer => peer.world?.players.length === 2), 'two clients in our room');
  assert.equal(host.world!.practice, false);
  assert.equal(host.world!.ranked, false);
  assert.ok(host.world!.players.every(kart => !kart.playerId && !kart.cpu));
  for (const peer of peers) peer.room.send('ready', { ready: true });
  await until(() => host.world!.players.every(kart => kart.ready), 'ready');
  host.room.send('start');
  await until(() => peers.every(peer => peer.world?.phase === 'racing'), 'normal race start');
  timer = setInterval(() => {
    for (const peer of peers) {
      const kart = peer.world?.players.find(player => player.id === peer.room.sessionId);
      if (!kart || kart.finished || peer.world?.phase !== 'racing' || !peer.room.connection.isOpen) continue;
      if (kart.epoch !== peer.epoch) { peer.epoch = kart.epoch; peer.seq = Math.max(0, kart.lastSeq + 1); }
      peer.room.send('input', autopilot(kart, peer.seq++, true)); peer.commands++;
    }
  }, 1000 / 30);
  let nextLog = Date.now();
  await until(() => {
    if (Date.now() >= nextLog) {
      nextLog = Date.now() + 15000;
      console.log(JSON.stringify({ raceTime: host.world?.raceTime, pads: activations.filter(a => a.source === 'pad').length,
        items: activations.filter(a => a.source === 'item').length, maximumSpeed,
        progress: host.world?.players.map(kart => ({ lap: kart.lap, progress: kart.progress })) }));
    }
    const pad = activations.some(a => a.source === 'pad' && a.maximumBoostedSpeed > a.before.speed + 3);
    const item = activations.some(a => a.source === 'item' && a.maximumBoostedSpeed > a.before.speed + 3 &&
      (host.world?.raceTime ?? 0) - a.raceTime > 2.5);
    if (pad && item && maximumSpeed > 40) { stoppedBecause = 'sufficient naturally collected pad and item acceleration evidence'; return true; }
    if (host.world?.phase === 'finished') { stoppedBecause = 'race finished'; return true; }
    return false;
  }, 'natural boost evidence or full race', 180000);
  assert.ok(activations.some(a => a.source === 'pad'), 'At least one pad must actually activate.');
  assert.ok(maximumSpeed > 40, 'The authoritative server must report boosted speed.');
  assert.deepEqual(errors, []);
  result = activations.some(a => a.source === 'item') ? 'passed' : 'partial-item-not-observed';
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  if (timer) clearInterval(timer);
  const cleanup = await Promise.allSettled(peers.map(async peer => {
    if (peer.room.connection.isOpen) await peer.room.leave();
  }));
  for (const outcome of cleanup) if (outcome.status === 'rejected') errors.push(`Cleanup: ${String(outcome.reason)}`);
  await pause(300);
  try { finalHealth = await (await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(15000) })).json(); }
  catch (error) { errors.push(`Final health: ${String(error)}`); }
  const report = {
    startedAt, finishedAt: new Date().toISOString(), origin, roomId, result, failure, stoppedBecause,
    kind: 'public-Colyseus-network',
    method: { circuit: 'lagon', practice: false, ranked: false, humanSdkClients: 2, authentication: 'anonymous; no account or token created',
      controls: 'Ordinary bounded autopilot inputs at 30 Hz after the real countdown, including use commands for naturally collected inventory.',
      stateInjection: false, observer: 'Authoritative snapshots received by the first SDK client.' },
    measurements: { maximumSpeedMetresPerSecond: maximumSpeed, maximumBoostSeconds: maximumBoost,
      naturallyObservedItems: [...items], activations,
      finalPhase: lastWorld?.phase, finalRaceSeconds: lastWorld?.raceTime,
      players: lastWorld?.players.map(kart => ({ id: kart.id, lap: kart.lap, finished: kart.finished, progress: kart.progress })),
      clients: peers.map(peer => ({ snapshots: peer.snapshots, commands: peer.commands, connectionClosed: !peer.room.connection.isOpen })) },
    initialHealth, finalHealth, notices, errors,
    limits: [
      'SDK clients, not browser input or rendering validation.',
      'Random draws may not produce both turbo and tripleTurbo; only observed activations are claimed.',
      'The before sample is the preceding received snapshot; maximum speed is sampled over the following 2.5 seconds while boost remains positive.',
      'Pad, item and aspiration effects may overlap; event speed windows are observational, not isolated source benchmarks.',
      'Other rooms are neither inspected nor modified; global health room counts can include concurrent users.',
    ],
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failure) process.exitCode = 1;
