import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { neutralInput, type Kart, type World } from '../shared/game.js';
import { getTrack } from '../shared/track.js';
import { kartLoopPose, kartLoopRoadPosition, loopLateralLimit } from '../shared/track-loop.js';

const origin = process.env.BASE_URL?.replace(/\/$/, '');
assert.ok(origin && /^https?:\/\//.test(origin), 'BASE_URL must explicitly select the deployed server.');
const reportFile = resolve(process.env.REPORT_FILE ?? 'docs/loop-driving/public-validation.json');
const track = getTrack('sky'), loop = track.loops[0]!;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value) ?? 'null').digest('hex');
type Peer = { room: Room; world?: World; sequence: number; epoch: number; snapshots: number; inputs: number };
type Passage = { driver: string; lap: number; steering: number; enteredAt: number; exitedAt?: number;
  attachedSnapshots: number; minimumFraction: number; maximumFraction: number; maximumLateral: number;
  maximumElevation: number; inverted: boolean; exited: boolean };
const peers: Peer[] = [], errors: string[] = [], notices: string[] = [], checks: string[] = [];
const passages = new Map<string, Passage>(), snapshots = new Map<string, { peer: number; hash: string }>();
let agreementCount = 0, mismatchedSnapshots = 0, before: unknown, after: unknown, healthBefore: unknown, healthAfter: unknown;
let timer: ReturnType<typeof setInterval> | undefined, lastWorld: World | undefined, roomId = '', failure = '', passed = false;
let maximumLateral = 0, maximumElevation = 0, detachedSnapshots = 0, airborneLoopSnapshots = 0;
const startedAt = new Date().toISOString();
async function json(path: string): Promise<unknown> {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, `${path} must return HTTP 200`); return response.json();
}
async function until(predicate: () => boolean, label: string, timeout = 15000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (errors.length) throw new Error(errors[0]);
    if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
    await pause(50);
  }
}
function violation(message: string): void { if (!errors.includes(message)) errors.push(message); }
function observe(world: World): void {
  lastWorld = world;
  if (world.phase !== 'racing') return;
  for (const kart of world.players) {
    if (kart.finished || kart.spectator) continue;
    const key = `${kart.id}:${kart.lap}`, progress = kart.routeProgress ?? kart.progress;
    let passage = passages.get(key);
    if (kart.loopId) {
      if (!passage) {
        passage = { driver: kart.id, lap: kart.lap, steering: [0, .35, -.35][Math.min(kart.lap, 2)]!, enteredAt: world.raceTime,
          attachedSnapshots: 0, minimumFraction: 1, maximumFraction: 0, maximumLateral: 0, maximumElevation: 0, inverted: false, exited: false };
        passages.set(key, passage);
      }
      const pose = kartLoopPose(kart), road = kartLoopRoadPosition(kart);
      if (!road || !pose.active) { violation(`${key}: loop attachment has no three-dimensional road pose`); continue; }
      const lateral = Math.abs((kart.x - road.x) * Math.cos(road.angle) - (kart.z - road.z) * Math.sin(road.angle));
      maximumLateral = Math.max(maximumLateral, lateral); maximumElevation = Math.max(maximumElevation, kart.elevation);
      passage.attachedSnapshots++; passage.minimumFraction = Math.min(passage.minimumFraction, pose.fraction);
      passage.maximumFraction = Math.max(passage.maximumFraction, pose.fraction); passage.maximumLateral = Math.max(passage.maximumLateral, lateral);
      passage.maximumElevation = Math.max(passage.maximumElevation, kart.elevation); passage.inverted ||= pose.up.y < -.9;
      if (lateral > loopLateralLimit(track.id) + .03) violation(`${key}: kart body crossed the looping rail`);
      if (kart.airborne) { airborneLoopSnapshots++; violation(`${key}: magnetic road lost contact`); }
    } else if (passage && !passage.exited) {
      if (progress >= loop.end && progress < loop.end + 25 && !kart.airborne && kart.elevation < .2) {
        passage.exited = true; passage.exitedAt = world.raceTime;
      } else if (progress > loop.start + .1 && progress < loop.end - .1) {
        detachedSnapshots++; violation(`${key}: detached before the looping exit`);
      }
    }
    if (![kart.x, kart.z, kart.elevation, kart.angle, kart.speed, progress].every(Number.isFinite)) violation(`${key}: non-finite state`);
  }
}
function attach(room: Room): Peer {
  const peerIndex = peers.length, peer: Peer = { room, sequence: 0, epoch: -1, snapshots: 0, inputs: 0 };
  peers.push(peer);
  room.onMessage('notice', ({ message }: { message: string }) => notices.push(message));
  room.onError((code, message) => violation(`Colyseus ${code}: ${message ?? ''}`));
  room.onMessage('snapshot', ({ world, tick, serverTime }: { world: World; tick: number; serverTime: number }) => {
    peer.world = world; peer.snapshots++;
    if (world.phase === 'racing' || world.phase === 'finished') {
      const value = hash(world), frame = `${tick}:${serverTime}`, other = snapshots.get(frame);
      if (other && other.peer !== peerIndex) {
        if (other.hash === value) agreementCount++;
        else { mismatchedSnapshots++; violation(`The two SDK clients disagree on server tick ${tick}`); }
        snapshots.delete(frame);
      } else snapshots.set(frame, { peer: peerIndex, hash: value });
      if (snapshots.size > 400) snapshots.delete(snapshots.keys().next().value!);
    }
    if (peerIndex === 0) observe(world);
  });
  return peer;
}
function control(peer: Peer, kart: Kart): void {
  if (kart.epoch !== peer.epoch) { peer.epoch = kart.epoch; peer.sequence = Math.max(0, kart.lastSeq + 1); }
  const seq = peer.sequence++;
  const input = kart.loopId ? { ...neutralInput(seq, kart.epoch), throttle: 1, steer: [0, .35, -.35][Math.min(kart.lap, 2)]! }
    : { ...autopilot(kart, seq, false), reset: false };
  peer.room.send('input', input); peer.inputs++;
}
try {
  before = await json('/api/tracks'); healthBefore = await json('/healthz');
  const host = attach(await new Client(origin.replace(/^http/, 'ws')).create('race', {
    name: 'Essai public looping 1', trackId: track.id, practice: false,
  }));
  roomId = host.room.roomId;
  attach(await new Client(origin.replace(/^http/, 'ws')).joinById(roomId, { name: 'Essai public looping 2' }));
  await until(() => peers.every(peer => peer.world?.players.length === 2), 'two anonymous clients in the same room');
  assert.equal(host.world!.practice, false); assert.equal(host.world!.ranked, false);
  assert.ok(host.world!.players.every(kart => !kart.playerId && !kart.cpu));
  host.room.send('configure', { eventLevel: 0 });
  await until(() => peers.every(peer => peer.world?.eventLevel === 0), 'classic course configuration');
  for (const peer of peers) peer.room.send('ready', { ready: true });
  await until(() => host.world!.players.every(kart => kart.ready), 'both pilots ready');
  host.room.send('start');
  await until(() => peers.every(peer => peer.world?.phase === 'racing'), 'real countdown and ordinary race start');
  checks.push('Deux clients anonymes reliés par HTTPS/WSS, course normale sky, départ après compte à rebours.');
  timer = setInterval(() => {
    for (const peer of peers) {
      const kart = peer.world?.players.find(player => player.id === peer.room.sessionId);
      if (kart && !kart.finished && peer.world?.phase === 'racing' && peer.room.connection.isOpen) control(peer, kart);
    }
  }, 1000 / 30);
  let nextLog = 0;
  await until(() => {
    if (Date.now() >= nextLog) {
      nextLog = Date.now() + 15000;
      console.log(JSON.stringify({ phase: host.world?.phase, raceTime: host.world?.raceTime, sharedSnapshots: agreementCount,
        passages: passages.size, exits: [...passages.values()].filter(passage => passage.exited).length,
        racers: host.world?.players.map(kart => ({ lap: kart.lap, finished: kart.finished, progress: kart.routeProgress })) }));
    }
    return peers.every(peer => peer.world?.phase === 'finished');
  }, 'two complete three-lap races without resets or state injection', 240000);
  assert.ok(lastWorld!.players.every(kart => kart.finished && kart.lap === 3), 'Both pilots must finish every ordered lap.');
  assert.equal(passages.size, 6, 'Each driver must cross the looping on each of the three laps.');
  for (const passage of passages.values()) {
    assert.ok(passage.inverted && passage.exited, 'Every passage must reach the inverted summit and use the normal exit.');
    assert.ok(passage.minimumFraction < .12 && passage.maximumFraction > .88, 'Observe both ends of each looping.');
  }
  assert.ok(agreementCount > 100); assert.equal(mismatchedSnapshots, 0); assert.deepEqual(errors, []);
  checks.push('Six passages complets, braquage neutre puis droite et gauche ; adhérence et corps contenus entre les rails.');
  checks.push('Trois tours terminés par les deux pilotes, snapshots autoritaires identiques aux mêmes ticks sur les deux clients.');
  await until(() => peers.every(peer => !!peer.world?.replayId), 'automatic anonymous replay persisted', 15000);
  checks.push('Replay anonyme de cette vraie course enregistré automatiquement par le serveur ; identifiant conservé dans le rapport.');
  passed = true;
} catch (error) { failure = error instanceof Error ? error.message : String(error); console.error(error); process.exitCode = 1; }
finally {
  clearInterval(timer);
  for (const outcome of await Promise.allSettled(peers.map(async peer => { if (peer.room.connection.isOpen) await peer.room.leave(); }))) {
    if (outcome.status === 'rejected') { violation(`Cleanup: ${String(outcome.reason)}`); passed = false; process.exitCode = 1; }
  }
  await pause(300);
  try {
    after = await json('/api/tracks'); healthAfter = await json('/healthz'); assert.deepEqual(after, before);
    checks.push('Catalogue public inchangé avant/après ; les deux connexions de test sont fermées.');
  } catch (error) { violation(String(error)); passed = false; process.exitCode = 1; }
  await mkdir(dirname(reportFile), { recursive: true });
  await writeFile(reportFile, JSON.stringify({ passed, startedAt, finishedAt: new Date().toISOString(), origin, roomId, checks, errors, failure,
    method: { sdkClients: 2, trackId: track.id, practice: false, ranked: false, eventLevel: 0, controlsHz: 30,
      authentication: 'anonymous; no profile or account created', stateInjection: false, resets: false, itemUse: false,
      steeringByLap: [0, .35, -.35], outsideLoop: 'ordinary autopilot commands with reset disabled',
      persistence: 'No profile, MMR or circuit publication. The normal server race completion may save its anonymous replay.' },
    measurements: { sharedSnapshots: agreementCount, mismatchedSnapshots, maximumLateral, bodyLateralLimit: loopLateralLimit(track.id),
      maximumElevation, detachedSnapshots, airborneLoopSnapshots, passages: [...passages.values()], finalPhase: lastWorld?.phase,
      raceTime: lastWorld?.raceTime, replayId: lastWorld?.replayId,
      players: lastWorld?.players.map(kart => ({ id: kart.id, lap: kart.lap, finished: kart.finished, finishTime: kart.finishTime, rank: kart.rank })),
      clients: peers.map(peer => ({ snapshots: peer.snapshots, inputs: peer.inputs, connectionClosed: !peer.room.connection.isOpen })) },
    catalogue: { unchanged: hash(before) === hash(after), beforeHash: hash(before), afterHash: hash(after) },
    healthBefore, healthAfter, notices,
    limits: ['SDK network validation; no browser rendering or physical phone controls tested here.',
      'Containment is checked at authoritative snapshot intervals; deterministic unit tests cover every simulation step.'],
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed, failure, passages: passages.size, sharedSnapshots: agreementCount, reportFile }));
}
