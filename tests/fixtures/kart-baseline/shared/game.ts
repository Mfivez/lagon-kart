import { COLORS, TOTAL_LAPS, getTrack, nearestTrack, spawnPoint, trackPoint, trackSurface, type Surface } from './track.js';
import { createTournament, type TournamentState } from './tournament.js';
export { CHECKPOINTS, COLORS, ROAD_WIDTH, TOTAL_LAPS, TRACK, TRACK_LENGTH, TRACKS, TRACK_IDS,
  getTrack, isTrackId, nearestTrack, spawnPoint, trackPoint, trackSurface } from './track.js';
export type { Vec2, TrackDefinition, TrackId, TrackZone, Surface } from './track.js';

export type Item = '' | 'turbo' | 'trap' | 'projectile';
export interface Input {
  seq: number; epoch: number; throttle: number; steer: number;
  brake: boolean; drift: boolean; use: boolean; reset: boolean;
}
export interface Kart {
  id: string; name: string; color: string; x: number; z: number; angle: number; speed: number;
  trackId: string; surface: Surface; turnVelocity: number; padCooldown: number; padZone: string;
  padLaps: Record<string, number>; launchCharge: number; launchArmed: boolean; launchPressed: boolean;
  launchFault: boolean; draftCharge: number; draftCooldown: number;
  driftCharge: number; boost: number; stun: number; lap: number; nextCheckpoint: number;
  progress: number; finished: boolean; finishTime: number; rank: number; item: Item;
  ready: boolean; connected: boolean; spectator: boolean; abandoned: boolean; lastSeq: number; epoch: number;
  driftDirection: number; lateralVelocity: number; respawnX: number; respawnZ: number;
  respawnAngle: number; resetCooldown: number; itemLatch: boolean; resetLatch: boolean;
}
export interface WorldObject {
  id: string; kind: 'trap' | 'projectile'; x: number; z: number; angle: number; owner: string; ttl: number;
}
export interface Pickup { id: string; x: number; z: number; cooldown: number }
export interface World {
  phase: 'lobby' | 'countdown' | 'racing' | 'finished'; players: Kart[];
  objects: WorldObject[]; pickups: Pickup[]; hostId: string; practice: boolean;
  round: number; time: number; countdown: number; raceTime: number; finishTimeout: number; seed: number;
  trackId: string; tournament: TournamentState;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const MAX_RACE_SECONDS = 300;
export const FINISH_GRACE_SECONDS = 25;

export function neutralInput(seq = 0, epoch = 0): Input {
  return { seq, epoch, throttle: 0, steer: 0, brake: false, drift: false, use: false, reset: false };
}

export function validateInput(data: unknown): Input | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const input = data as Record<string, unknown>;
  const keys = ['seq', 'epoch', 'throttle', 'steer', 'brake', 'drift', 'use', 'reset'];
  if (Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) return null;
  if (!Number.isSafeInteger(input.seq) || (input.seq as number) < 0 ||
      !Number.isSafeInteger(input.epoch) || (input.epoch as number) < 0) return null;
  if (typeof input.throttle !== 'number' || !Number.isFinite(input.throttle) || Math.abs(input.throttle) > 1 ||
      typeof input.steer !== 'number' || !Number.isFinite(input.steer) || Math.abs(input.steer) > 1) return null;
  if (['brake', 'drift', 'use', 'reset'].some(key => typeof input[key] !== 'boolean')) return null;
  return { seq: input.seq as number, epoch: input.epoch as number,
    throttle: input.throttle, steer: input.steer, brake: input.brake as boolean,
    drift: input.drift as boolean, use: input.use as boolean, reset: input.reset as boolean };
}

export function createKart(id: string, name: string, color: string, index: number, trackId = 'lagon'): Kart {
  trackId = getTrack(trackId).id;
  const spawn = spawnPoint(index, trackId);
  return { id, name, color: COLORS.includes(color) ? color : COLORS[index % COLORS.length]!,
    ...spawn, speed: 0, driftCharge: 0, boost: 0, stun: 0, lap: 0, nextCheckpoint: 1,
    progress: -6 - Math.floor(index / 2) * 5, finished: false, finishTime: 0, rank: index + 1,
    item: '', ready: false, connected: true, spectator: false, abandoned: false, lastSeq: -1, epoch: 0,
    driftDirection: 0, lateralVelocity: 0, respawnX: spawn.x, respawnZ: spawn.z,
    respawnAngle: spawn.angle, resetCooldown: 0, itemLatch: false, resetLatch: false,
    trackId, surface: 'road', turnVelocity: 0, padCooldown: 0, padZone: '', padLaps: {},
    launchCharge: 0, launchArmed: false, launchPressed: false, launchFault: false, draftCharge: 0, draftCooldown: 0 };
}

export function createWorld(practice = false, trackId = 'lagon'): World {
  trackId = getTrack(trackId).id;
  return { phase: 'lobby', players: [], objects: [], pickups: makePickups(trackId), hostId: '',
    practice, round: 0, time: 0, countdown: 0, raceTime: 0, finishTimeout: 0, seed: 0x12345678,
    trackId, tournament: createTournament(trackId) };
}

function makePickups(trackId: string): Pickup[] {
  return [0.12, 0.36, 0.62, 0.84].flatMap((fraction, row) => {
    const point = trackPoint(fraction * getTrack(trackId).length, trackId);
    return [-3.6, 0, 3.6].map((offset, column) => ({ id: `pickup-${row}-${column}`,
      x: point.x + Math.cos(point.angle) * offset, z: point.z - Math.sin(point.angle) * offset, cooldown: 0 }));
  });
}

export function startRace(world: World): void {
  world.phase = 'countdown';
  world.countdown = 3;
  world.round++;
  world.raceTime = 0;
  world.finishTimeout = 0;
  world.objects = [];
  world.trackId = getTrack(world.trackId).id;
  world.pickups = makePickups(world.trackId);
  let index = 0;
  for (const kart of world.players) {
    if (kart.spectator || kart.abandoned) continue;
    const { ready, connected, lastSeq, epoch } = kart;
    Object.assign(kart, createKart(kart.id, kart.name, kart.color, index++, world.trackId), { ready, connected, lastSeq, epoch });
  }
}

export function resetKart(kart: Kart): void {
  kart.x = kart.respawnX;
  kart.z = kart.respawnZ;
  kart.angle = kart.respawnAngle;
  kart.speed = 0;
  kart.lateralVelocity = 0;
  kart.driftCharge = 0;
  kart.driftDirection = 0;
  kart.boost = 0;
  kart.stun = 0;
  kart.resetCooldown = 1.5;
  kart.turnVelocity = 0;
  kart.draftCharge = 0;
  kart.surface = trackSurface(kart.x, kart.z, kart.trackId).surface;
  // Keep padLaps and its cooldown: a reset never renews the same pad's reward.
}

// Only deterministic movement belongs here, so clients can replay acknowledged
// input frames. Progression, other karts and all item effects stay in stepWorld.
export function stepKart(kart: Kart, input: Input, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || kart.spectator || kart.finished || kart.abandoned) return;
  dt = Math.min(dt, 0.1);
  kart.resetCooldown = Math.max(0, kart.resetCooldown - dt);
  if (input.reset && !kart.resetLatch && kart.resetCooldown === 0) resetKart(kart);
  kart.resetLatch = input.reset;
  kart.boost = Math.max(0, kart.boost - dt);
  kart.stun = Math.max(0, kart.stun - dt);
  const track = getTrack(kart.trackId);
  const position = nearestTrack(kart.x, kart.z, track.id);
  const contact = trackSurface(kart.x, kart.z, track.id, position);
  kart.surface = contact.surface;
  const offroad = kart.surface === 'offroad';
  const mud = kart.surface === 'mud';
  const ice = kart.surface === 'ice';
  kart.padCooldown = Math.max(0, kart.padCooldown - dt);
  const pad = contact.zone?.kind === 'boost' ? contact.zone : undefined;
  if (pad && kart.padZone !== pad.id && kart.padCooldown === 0 && kart.padLaps[pad.id] !== kart.lap &&
      kart.speed > 5 && Math.cos(kart.angle - position.angle) > 0.3 && kart.stun === 0) {
    kart.boost = Math.max(kart.boost, 1.05);
    kart.padCooldown = 2.5;
    kart.padLaps = { ...kart.padLaps, [pad.id]: kart.lap };
  }
  kart.padZone = pad?.id ?? '';
  const throttle = kart.stun > 0 ? 0 : input.throttle;
  const steer = kart.stun > 0 ? 0 : input.steer;
  const drifting = input.drift && Math.abs(steer) > 0.12 && kart.speed > 10 && !offroad && kart.stun === 0;
  if (drifting) {
    kart.driftDirection = Math.sign(steer);
    kart.driftCharge = Math.min(2, kart.driftCharge + dt);
  } else {
    if (kart.driftCharge >= 0.65 && kart.stun === 0 && !offroad)
      kart.boost = Math.max(kart.boost, 0.55 + kart.driftCharge * 0.4);
    kart.driftCharge = 0;
    kart.driftDirection = 0;
  }
  const maximumSpeed = offroad ? 12 : mud ? 16 : kart.boost > 0 ? 46 : 32;
  if (input.brake) {
    kart.speed = Math.sign(kart.speed) * Math.max(0, Math.abs(kart.speed) - 42 * dt);
  } else if (throttle !== 0) {
    kart.speed += throttle * (mud ? 13 : kart.boost > 0 ? 38 : 22) * dt;
  } else {
    kart.speed *= Math.exp(-(kart.stun > 0 ? 4.5 : ice ? 0.38 : 1.25) * dt);
  }
  if (kart.boost > 0 && !offroad && !mud && !input.brake && kart.stun === 0) kart.speed += 30 * dt;
  if (kart.speed > maximumSpeed) kart.speed = Math.max(maximumSpeed, kart.speed - (mud || offroad ? 55 : 28) * dt);
  kart.speed = clamp(kart.speed, -9, 46);
  if (Math.abs(kart.speed) < 0.025) kart.speed = 0;
  const steerPower = Math.min(Math.abs(kart.speed) / 12, 1);
  const grip = track.grip * (ice ? 0.38 : mud ? 0.85 : 1);
  const turn = steer * 1.32 * steerPower * (drifting ? 1.35 : 1) * Math.sign(kart.speed);
  kart.turnVelocity += (turn - kart.turnVelocity) * Math.min(1, dt * 11 * grip);
  kart.angle += kart.turnVelocity * dt;
  kart.angle = Math.atan2(Math.sin(kart.angle), Math.cos(kart.angle));
  const sideways = drifting ? -steer * Math.min(kart.speed * 0.24, 7) : ice ? -steer * Math.min(kart.speed * 0.1, 4) : 0;
  kart.lateralVelocity += (sideways - kart.lateralVelocity) * Math.min(1, dt * 5 * grip);
  kart.x += (Math.sin(kart.angle) * kart.speed + Math.cos(kart.angle) * kart.lateralVelocity) * dt;
  kart.z += (Math.cos(kart.angle) * kart.speed - Math.sin(kart.angle) * kart.lateralVelocity) * dt;
  constrainToTrack(kart);
}

function constrainToTrack(kart: Kart): void {
  const near = nearestTrack(kart.x, kart.z, kart.trackId);
  const limit = getTrack(kart.trackId).width / 2 + 5;
  if (near.distance > limit) {
    kart.x = near.x + (kart.x - near.x) / near.distance * limit;
    kart.z = near.z + (kart.z - near.z) / near.distance * limit;
    kart.speed *= 0.72;
    kart.lateralVelocity *= 0.5;
  }
}

function random(world: World): number {
  world.seed = (Math.imul(world.seed, 1664525) + 1013904223) >>> 0;
  return world.seed / 0x100000000;
}

function advanceCheckpoint(kart: Kart, before: { x: number; z: number }, world: World): void {
  const track = getTrack(world.trackId);
  const checkpoints = track.checkpoints;
  const checkpoint = checkpoints[kart.nextCheckpoint]!;
  const dx = Math.sin(checkpoint.angle);
  const dz = Math.cos(checkpoint.angle);
  const previousSide = (before.x - checkpoint.x) * dx + (before.z - checkpoint.z) * dz;
  const currentSide = (kart.x - checkpoint.x) * dx + (kart.z - checkpoint.z) * dz;
  if (previousSide < 0 && currentSide >= 0) {
    const t = -previousSide / (currentSide - previousSide);
    const crossX = before.x + (kart.x - before.x) * t;
    const crossZ = before.z + (kart.z - before.z) * t;
    if (Math.hypot(crossX - checkpoint.x, crossZ - checkpoint.z) <= track.width / 2 + 2) {
      kart.respawnX = checkpoint.x + dx * 2;
      kart.respawnZ = checkpoint.z + dz * 2;
      kart.respawnAngle = checkpoint.angle;
      if (kart.nextCheckpoint === 0) {
        kart.lap++;
        if (kart.lap >= TOTAL_LAPS) {
          kart.finished = true;
          kart.finishTime = world.raceTime;
          kart.progress = TOTAL_LAPS * track.length;
          kart.speed = 0;
          if (world.finishTimeout === 0) world.finishTimeout = FINISH_GRACE_SECONDS;
        }
      }
      kart.nextCheckpoint = (kart.nextCheckpoint + 1) % checkpoints.length;
    }
  }
  if (!kart.finished) {
    const near = nearestTrack(kart.x, kart.z, track.id);
    // Bound ranking to the checkpoint interval already validated. Driving back
    // over the finish, skipping a gate or resetting cannot manufacture a lap.
    const last = kart.nextCheckpoint === 0 ? checkpoints.length - 1 : kart.nextCheckpoint - 1;
    const minimum = last * track.length / checkpoints.length;
    const maximum = (last + 1) * track.length / checkpoints.length;
    let localProgress = near.progress;
    if (kart.nextCheckpoint === 1 && localProgress > track.length * 0.9) localProgress -= track.length;
    kart.progress = kart.lap * track.length + clamp(localProgress, minimum - 15, maximum);
  }
}

function useItem(world: World, kart: Kart): void {
  if (!kart.item) return;
  if (kart.item === 'turbo') kart.boost = Math.max(kart.boost, 2.2);
  else {
    const forward = kart.item === 'projectile';
    const distance = forward ? 3 : -3;
    world.objects.push({ id: `${world.round}-${kart.id}-${Math.floor(world.time * 1000)}-${world.seed}`,
      kind: kart.item, x: kart.x + Math.sin(kart.angle) * distance,
      z: kart.z + Math.cos(kart.angle) * distance, angle: kart.angle, owner: kart.id, ttl: forward ? 4 : 18 });
  }
  kart.item = '';
}

function collideKarts(players: Kart[]): void {
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i]!;
    const b = players[j]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= 2.5) continue;
    const nx = distance < 0.001 ? 1 : dx / distance;
    const nz = distance < 0.001 ? 0 : dz / distance;
    const push = (2.5 - distance) / 2;
    a.x -= nx * push; a.z -= nz * push;
    b.x += nx * push; b.z += nz * push;
    const aNormal = Math.sin(a.angle) * nx + Math.cos(a.angle) * nz;
    const bNormal = Math.sin(b.angle) * nx + Math.cos(b.angle) * nz;
    const closingSpeed = a.speed * aNormal - b.speed * bNormal;
    // Equal-speed neighbours retain momentum. Only approaching karts exchange
    // an impulse, preventing traffic jams caused by damping on every tick.
    if (closingSpeed > 0) {
      a.speed = clamp(a.speed - closingSpeed * 0.5 * aNormal, -9, 46);
      b.speed = clamp(b.speed + closingSpeed * 0.5 * bNormal, -9, 46);
    }
    constrainToTrack(a); constrainToTrack(b);
  }
}

function stepObjects(world: World, racers: Kart[], dt: number): void {
  for (const object of world.objects) {
    object.ttl -= dt;
    if (object.kind === 'projectile') {
      object.x += Math.sin(object.angle) * 62 * dt;
      object.z += Math.cos(object.angle) * 62 * dt;
      if (nearestTrack(object.x, object.z, world.trackId).distance > getTrack(world.trackId).width / 2 + 5) object.ttl = 0;
    }
    if (object.ttl <= 0) continue;
    const victim = racers.find(kart => kart.id !== object.owner && kart.stun === 0 &&
      Math.hypot(kart.x - object.x, kart.z - object.z) < 2.5);
    if (victim) {
      victim.stun = 1.05;
      victim.speed *= 0.2;
      victim.boost = 0;
      victim.driftCharge = 0;
      object.ttl = 0;
    }
  }
  world.objects = world.objects.filter(object => object.ttl > 0);
}

export function standings(world: World): Kart[] {
  return world.players.filter(kart => !kart.spectator).slice().sort((a, b) =>
    a.finished && b.finished ? a.finishTime - b.finishTime || a.id.localeCompare(b.id) :
    a.finished ? -1 : b.finished ? 1 : b.progress - a.progress || a.id.localeCompare(b.id));
}

function chargeLaunch(world: World, inputs: Map<string, Input>, dt: number): void {
  for (const kart of world.players) {
    if (kart.spectator || kart.abandoned) continue;
    const input = inputs.get(kart.id);
    const pressed = kart.connected && !!input && input.throttle > 0.5 && !input.brake;
    if (pressed && !kart.launchPressed) {
      kart.launchArmed = world.countdown <= 1 + 1e-8;
      kart.launchFault = !kart.launchArmed;
    }
    if (!pressed) { kart.launchArmed = false; kart.launchCharge = 0; kart.launchFault = false; }
    else if (kart.launchArmed) kart.launchCharge = Math.min(1, kart.launchCharge + dt);
    kart.launchPressed = pressed;
  }
}

function chargeDraft(racers: Kart[], dt: number): void {
  for (const kart of racers) {
    kart.draftCooldown = Math.max(0, kart.draftCooldown - dt);
    const eligible = kart.connected && kart.speed > 12 && kart.stun === 0 && kart.draftCooldown === 0 &&
      nearestTrack(kart.x, kart.z, kart.trackId).distance <= getTrack(kart.trackId).width / 2;
    const behind = eligible && racers.some(leader => {
      if (leader === kart || !leader.connected || leader.speed < 12 || leader.stun > 0 || leader.trackId !== kart.trackId ||
          Math.cos(leader.angle - kart.angle) < .9) return false;
      const dx = leader.x - kart.x;
      const dz = leader.z - kart.z;
      const forward = dx * Math.sin(kart.angle) + dz * Math.cos(kart.angle);
      const sideways = dx * Math.cos(kart.angle) - dz * Math.sin(kart.angle);
      return forward > 3.5 && forward < 18 && Math.abs(sideways) < 2.6;
    });
    kart.draftCharge = behind ? Math.min(1, kart.draftCharge + dt) : Math.max(0, kart.draftCharge - 2 * dt);
    if (kart.draftCharge >= 1 - 1e-8) {
      kart.boost = Math.max(kart.boost, 1.2);
      kart.draftCooldown = 3;
      kart.draftCharge = 0;
    }
  }
}

export function stepWorld(world: World, inputs: Map<string, Input>, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.1);
  world.time += dt;
  if (world.phase === 'countdown') {
    chargeLaunch(world, inputs, dt);
    world.countdown = Math.max(0, world.countdown - dt);
    if (world.countdown < 1e-8) {
      world.countdown = 0;
      world.phase = 'racing';
      for (const kart of world.players) {
        if (!kart.spectator && !kart.abandoned && kart.connected && kart.launchArmed && kart.launchPressed && kart.launchCharge >= .2)
          kart.boost = 1 + kart.launchCharge * .5;
      }
    }
    return;
  }
  if (world.phase !== 'racing') return;
  world.raceTime += dt;
  if (world.finishTimeout > 0) world.finishTimeout = Math.max(1e-8, world.finishTimeout - dt);
  const racers = world.players.filter(kart => !kart.spectator && !kart.finished && !kart.abandoned);
  chargeDraft(racers, dt);
  const previousPositions = new Map<string, { x: number; z: number }>();
  for (const kart of racers) {
    const input = kart.connected ? inputs.get(kart.id) ?? neutralInput() : neutralInput();
    previousPositions.set(kart.id, { x: kart.x, z: kart.z });
    // A reset teleports to a validated checkpoint and must never cross a gate.
    const resetTriggered = input.reset && !kart.resetLatch && kart.resetCooldown <= dt;
    stepKart(kart, input, dt);
    if (resetTriggered) previousPositions.set(kart.id, { x: kart.x, z: kart.z });
    if (input.use && !kart.itemLatch) useItem(world, kart);
    kart.itemLatch = input.use;
  }
  collideKarts(racers);
  for (const kart of racers) advanceCheckpoint(kart, previousPositions.get(kart.id)!, world);
  stepObjects(world, racers.filter(kart => !kart.finished), dt);
  for (const pickup of world.pickups) {
    pickup.cooldown = Math.max(0, pickup.cooldown - dt);
    if (pickup.cooldown > 0) continue;
    const kart = racers.find(player => !player.finished && !player.item && Math.hypot(player.x - pickup.x, player.z - pickup.z) < 2.8);
    if (kart) { kart.item = (['turbo', 'trap', 'projectile'] as const)[Math.floor(random(world) * 3)]!; pickup.cooldown = 7; }
  }
  const ordered = standings(world);
  ordered.forEach((kart, index) => { kart.rank = index + 1; });
  if (ordered.every(kart => kart.finished || kart.abandoned) || world.finishTimeout === 1e-8 || world.raceTime >= MAX_RACE_SECONDS) {
    world.phase = 'finished';
    for (const kart of world.players) kart.speed = 0;
  }
}
