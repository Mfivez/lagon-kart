import { COLORS, TOTAL_LAPS, BASE_RACE_SECONDS, getTrackLapCount, getTrackRaceTimeLimit, getTrack, nearestTrack, spawnPoint, trackPoint, trackSurface, trackElevation, trackJumpAt, type Surface } from './track.js';
import { createTournament, type TournamentState } from './tournament.js';
import { DEFAULT_KART_MODEL, normalizeKartModelId, type KartModelId } from './kart-catalog.js';
import { DEFAULT_CHARACTER, normalizeCharacterId, type CharacterId } from './characters.js';
import { DEFAULT_BUILD, normalizeBuild, getKartStats, type KartBuild } from './garage.js';
import { nearestDriveableTrack, dynamicSurface, constrainTrackEvent, trackEventPickups, eventRoutePoint, eventCheckpointGates, getTrackEvent, trackBoundaryGap } from './track-events.js';
import { TRACK_SHOULDER, KART_COLLISION_HEIGHT, trackBoundaryHeight, trackBoundaryShoulder, driveableGroundHeight } from './obstacle-heights.js';
import { kartLoopPose, trackLoopAt, trackLoopPose, type LoopVector } from './track-loop.js';
export { CHECKPOINTS, COLORS, ROAD_WIDTH, TOTAL_LAPS, TRACK, TRACK_LENGTH, TRACKS, TRACK_IDS,
  getTrack, isTrackId, nearestTrack, spawnPoint, trackPoint, trackSurface } from './track.js';
export type { Vec2, TrackDefinition, TrackId, TrackZone, Surface } from './track.js';

export const ITEMS = ['turbo', 'tripleTurbo', 'trap', 'projectile', 'seeker', 'leaderBolt', 'star', 'shield'] as const;
export type Item = '' | typeof ITEMS[number];
export interface Input {
  seq: number; epoch: number; throttle: number; steer: number;
  brake: boolean; drift: boolean; use: boolean; reset: boolean;
}
export interface Kart {
  id: string; name: string; color: string; x: number; z: number; angle: number; speed: number;
  modelId: KartModelId; characterId: CharacterId; build: KartBuild; playerId: string; careerLevel: number;
  eventStage: number; eventLevel: number; team: 0 | 1; cpu: boolean;
  elevation: number; verticalVelocity: number; airborne: boolean; loopId: string;
  trackId: string; surface: Surface; turnVelocity: number; padCooldown: number; padZone: string;
  padLaps: Record<string, number>; launchCharge: number; launchArmed: boolean; launchPressed: boolean;
  launchFault: boolean; draftCharge: number; draftCooldown: number;
  driftCharge: number; boost: number; stun: number; lap: number; nextCheckpoint: number;
  progress: number; finished: boolean; finishTime: number; rank: number; item: Item;
  itemCharges: number; invincible: number; shield: number; hitGrace: number;
  ready: boolean; connected: boolean; spectator: boolean; abandoned: boolean; lastSeq: number; epoch: number;
  driftDirection: number; lateralVelocity: number; respawnX: number; respawnZ: number;
  respawnAngle: number; resetCooldown: number; itemLatch: boolean; resetLatch: boolean;
}
export interface WorldObject {
  id: string; kind: 'trap' | 'projectile' | 'seeker' | 'leaderBolt';
  x: number; z: number; angle: number; owner: string; ttl: number; targetId?: string;
}
export interface Pickup { id: string; x: number; z: number; cooldown: number }
export interface World {
  phase: 'lobby' | 'countdown' | 'racing' | 'finished'; players: Kart[];
  objects: WorldObject[]; pickups: Pickup[]; hostId: string; practice: boolean;
  round: number; time: number; countdown: number; raceTime: number; finishTimeout: number; seed: number;
  trackId: string; tournament: TournamentState;
  eventStage: number; eventLevel: number; teamMode: boolean; ranked: boolean; championshipId: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const MAX_RACE_SECONDS = BASE_RACE_SECONDS;
export const FINISH_GRACE_SECONDS = 25;
export const MAX_WORLD_OBJECTS = 32;
export const STAR_SECONDS = 5.5;
export const SHIELD_SECONDS = 8;
// The checkpoint corridor must match the shoulder that movement really allows.
// A smaller gate silently loses an otherwise legal lap at an outside corner.

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

export function createKart(id: string, name: string, color: string, index: number, trackId = 'lagon', modelId: string = DEFAULT_KART_MODEL, build: KartBuild = DEFAULT_BUILD, characterId: string = DEFAULT_CHARACTER): Kart {
  trackId = getTrack(trackId).id;
  const spawn = spawnPoint(index, trackId);
  return { id, name, color: COLORS.includes(color) ? color : COLORS[index % COLORS.length]!,
    modelId: normalizeKartModelId(modelId), characterId: normalizeCharacterId(characterId), build: normalizeBuild(build, 3), playerId: '', careerLevel: 0,
    eventStage: 0, eventLevel: 0, team: index % 2 as 0 | 1, cpu: false,
    ...spawn, elevation: trackElevation(nearestTrack(spawn.x, spawn.z, trackId).progress, trackId), verticalVelocity: 0, airborne: false, loopId: '',
    speed: 0, driftCharge: 0, boost: 0, stun: 0, lap: 0, nextCheckpoint: 1,
    progress: -6 - Math.floor(index / 2) * 5, finished: false, finishTime: 0, rank: index + 1,
    item: '', itemCharges: 0, invincible: 0, shield: 0, hitGrace: 0,
    ready: false, connected: true, spectator: false, abandoned: false, lastSeq: -1, epoch: 0,
    driftDirection: 0, lateralVelocity: 0, respawnX: spawn.x, respawnZ: spawn.z,
    respawnAngle: spawn.angle, resetCooldown: 0, itemLatch: false, resetLatch: false,
    trackId, surface: 'road', turnVelocity: 0, padCooldown: 0, padZone: '', padLaps: {},
    launchCharge: 0, launchArmed: false, launchPressed: false, launchFault: false, draftCharge: 0, draftCooldown: 0 };
}

export function createWorld(practice = false, trackId = 'lagon'): World {
  trackId = getTrack(trackId).id;
  return { phase: 'lobby', players: [], objects: [], pickups: makePickups(trackId), hostId: '',
    practice, round: 0, time: 0, countdown: 0, raceTime: 0, finishTimeout: 0, seed: 0x12345678,
    trackId, tournament: createTournament(trackId), eventStage: 0, eventLevel: 0, teamMode: false, ranked: false, championshipId: '' };
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
  world.eventStage = 0;
  world.trackId = getTrack(world.trackId).id;
  world.pickups = [...makePickups(world.trackId), ...trackEventPickups(world.trackId, 0, world.eventLevel)];
  let index = 0;
  for (const kart of world.players) {
    if (kart.spectator || kart.abandoned) continue;
    const { ready, connected, lastSeq, epoch, playerId, careerLevel, team, cpu } = kart;
    Object.assign(kart, createKart(kart.id, kart.name, kart.color, index++, world.trackId, kart.modelId, kart.build, kart.characterId), { ready, connected, lastSeq, epoch, playerId, careerLevel, team, cpu, eventStage: 0, eventLevel: world.eventLevel });
  }
}

export function resetKart(kart: Kart): void {
  const track = getTrack(kart.trackId), event = getTrackEvent(kart.trackId, kart.eventStage, kart.eventLevel);
  if (event.blockers.length) {
    const previousCheckpoint = (kart.nextCheckpoint + track.checkpoints.length - 1) % track.checkpoints.length;
    const gates = eventCheckpointGates(track.id, previousCheckpoint, kart.eventStage, kart.eventLevel);
    const detour = event.branches.find(branch => branch.kind === 'detour' && branch.open);
    const replacement = detour && gates.find(gate => gate.branchId === detour.id);
    const respawn = nearestDriveableTrack(kart.respawnX, kart.respawnZ, track.id, kart.eventStage, kart.eventLevel);
    const alreadyOnBranch = Boolean(respawn.branchId) || gates.some(gate => gate.branchId &&
      Math.hypot(kart.respawnX - gate.x - Math.sin(gate.angle) * 2, kart.respawnZ - gate.z - Math.cos(gate.angle) * 2) < 3);
    if (replacement && detour && !alreadyOnBranch && respawn.progress > detour.start && respawn.progress < detour.end) {
      // The shared phase may have closed the old road after this gate was
      // validated. Move only its respawn to the equivalent open detour gate;
      // never change lap, checkpoint, ranking progress or item-pad credits.
      kart.respawnX = replacement.x + Math.sin(replacement.angle) * 2;
      kart.respawnZ = replacement.z + Math.cos(replacement.angle) * 2;
      kart.respawnAngle = replacement.angle;
    }
  }
  kart.x = kart.respawnX;
  kart.z = kart.respawnZ;
  kart.angle = kart.respawnAngle;
  const ground = nearestDriveableTrack(kart.x, kart.z, kart.trackId, kart.eventStage, kart.eventLevel);
  kart.elevation = trackElevation(ground.progress, kart.trackId);
  kart.verticalVelocity = 0;
  kart.airborne = false;
  kart.loopId = !ground.branchId ? trackLoopAt(ground.progress, kart.trackId)?.id ?? '' : '';
  kart.speed = 0;
  kart.lateralVelocity = 0;
  kart.driftCharge = 0;
  kart.driftDirection = 0;
  kart.boost = 0;
  kart.stun = 0;
  kart.resetCooldown = 1.5;
  kart.turnVelocity = 0;
  kart.draftCharge = 0;
  kart.surface = dynamicSurface(kart.x, kart.z, kart.trackId, kart.eventStage, kart.eventLevel).surface;
  // Keep padLaps and its cooldown: a reset never renews the same pad's reward.
}

// Only deterministic movement belongs here, so clients can replay acknowledged
// input frames. Progression, other karts and all item effects stay in stepWorld.
export function stepKart(kart: Kart, input: Input, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || kart.spectator || kart.finished || kart.abandoned) return;
  dt = Math.min(dt, 0.1);
  const stats = getKartStats(kart.build);
  kart.resetCooldown = Math.max(0, kart.resetCooldown - dt);
  if (input.reset && !kart.resetLatch && kart.resetCooldown === 0) resetKart(kart);
  kart.resetLatch = input.reset;
  const previousX = kart.x, previousZ = kart.z, previousElevation = kart.elevation;
  kart.boost = Math.max(0, kart.boost - dt);
  kart.stun = Math.max(0, kart.stun - dt);
  kart.invincible = Math.max(0, kart.invincible - dt);
  kart.shield = Math.max(0, kart.shield - dt);
  kart.hitGrace = Math.max(0, kart.hitGrace - dt);
  const track = getTrack(kart.trackId);
  const position = nearestDriveableTrack(kart.x, kart.z, track.id, kart.eventStage, kart.eventLevel);
  const possibleLoop = !position.branchId && !kart.airborne && position.distance <= position.width / 2 + TRACK_SHOULDER
    ? trackLoopAt(position.progress, track.id) : undefined;
  const currentLoop = possibleLoop && (kart.loopId === possibleLoop.id ||
    (trackElevation(position.progress, track.id) < .75 && Math.abs(kart.elevation - trackElevation(position.progress, track.id)) < .75))
    ? possibleLoop : undefined;
  kart.loopId = currentLoop?.id ?? '';
  const loopPose = currentLoop ? trackLoopPose(position.progress, track.id) : undefined;
  const contact = dynamicSurface(kart.x, kart.z, track.id, kart.eventStage, kart.eventLevel, position);
  kart.surface = contact.surface;
  const offroad = kart.surface === 'offroad';
  const mud = kart.surface === 'mud';
  const ice = kart.surface === 'ice';
  kart.padCooldown = Math.max(0, kart.padCooldown - dt);
  const pad = contact.zone?.kind === 'boost' ? contact.zone : undefined;
  if (pad && !kart.airborne && kart.padZone !== pad.id && kart.padCooldown === 0 && kart.padLaps[pad.id] !== kart.lap &&
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
      kart.boost = Math.max(kart.boost, (0.55 + kart.driftCharge * 0.4) * stats.turbo);
    kart.driftCharge = 0;
    kart.driftDirection = 0;
  }
  const maximumSpeed = offroad ? stats.offroad : mud ? stats.mud : kart.boost > 0 ? 46 : stats.speed;
  if (input.brake) {
    kart.speed = Math.sign(kart.speed) * Math.max(0, Math.abs(kart.speed) - 42 * dt);
  } else if (throttle !== 0) {
    kart.speed += throttle * (mud ? stats.acceleration * 13 / 22 : kart.boost > 0 ? stats.acceleration + 16 : stats.acceleration) * dt;
  } else {
    kart.speed *= Math.exp(-(kart.stun > 0 ? 4.5 : ice ? 0.38 : 1.25) * dt);
  }
  if (kart.boost > 0 && !offroad && !mud && !input.brake && kart.stun === 0) kart.speed += 30 * dt;
  if (kart.speed > maximumSpeed) kart.speed = Math.max(maximumSpeed, kart.speed - (mud || offroad ? 55 : 28) * dt);
  kart.speed = clamp(kart.speed, -9, 46);
  if (Math.abs(kart.speed) < 0.025) kart.speed = 0;
  // Magnetic adhesion makes a stopped or reversed loop playable. Gravity only
  // changes a moving kart's speed; holding the brake can park it on the ceiling.
  if (loopPose && Math.abs(kart.speed) > .1 && !input.brake)
    kart.speed = clamp(kart.speed - loopPose.tangent.y * 8 * dt, -9, 46);
  const steerPower = Math.min(Math.abs(kart.speed) / 12, 1);
  const grip = track.grip * stats.grip * (ice ? 0.38 : mud ? 0.85 : 1);
  const turn = steer * stats.handling * steerPower * (drifting ? 1.35 : 1) * Math.sign(kart.speed);
  kart.turnVelocity += (turn - kart.turnVelocity) * Math.min(1, dt * 11 * grip);
  kart.angle += kart.turnVelocity * dt;
  kart.angle = Math.atan2(Math.sin(kart.angle), Math.cos(kart.angle));
  const sideways = (drifting ? -steer * Math.min(kart.speed * 0.24, 7) : ice ? -steer * Math.min(kart.speed * 0.1, 4) : 0) / stats.stability;
  kart.lateralVelocity += (sideways - kart.lateralVelocity) * Math.min(1, dt * 5 * grip);
  if (loopPose) {
    // Preserve steering and sideways motion while converting forward velocity
    // into logical route metres. HUD speed remains real metres per second.
    const difference = kart.angle - position.angle;
    const along = (Math.cos(difference) * kart.speed - Math.sin(difference) * kart.lateralVelocity) * loopPose.speedScale;
    const across = Math.sin(difference) * kart.speed + Math.cos(difference) * kart.lateralVelocity;
    kart.x += (Math.sin(position.angle) * along + Math.cos(position.angle) * across) * dt;
    kart.z += (Math.cos(position.angle) * along - Math.sin(position.angle) * across) * dt;
  } else {
    kart.x += (Math.sin(kart.angle) * kart.speed + Math.cos(kart.angle) * kart.lateralVelocity) * dt;
    kart.z += (Math.cos(kart.angle) * kart.speed - Math.sin(kart.angle) * kart.lateralVelocity) * dt;
  }
  const next = nearestDriveableTrack(kart.x, kart.z, track.id, kart.eventStage, kart.eventLevel);
  const possibleNextLoop = !next.branchId && !kart.airborne && next.distance <= next.width / 2 + TRACK_SHOULDER
    ? trackLoopAt(next.progress, track.id) : undefined;
  const nextLoop = possibleNextLoop && (currentLoop?.id === possibleNextLoop.id ||
    (trackElevation(next.progress, track.id) < .75 && Math.abs(kart.elevation - trackElevation(next.progress, track.id)) < .75))
    ? possibleNextLoop : undefined;
  if (nextLoop) {
    kart.loopId = nextLoop.id;
    kart.elevation = trackElevation(next.progress, track.id);
    kart.verticalVelocity = 0;
  } else kart.loopId = '';
  const ground = driveableGroundHeight(next, track.id, kart.elevation);
  const ramp = trackJumpAt(position.progress, track.id);
  const forward = (next.progress - position.progress + track.length) % track.length;
  // Launch only when physically crossing the lip in the forward direction.
  // Prediction and the server share this deterministic vertical motion; X/Z
  // steering and ordered checkpoint validation keep their existing rules.
  if (nextLoop) {
    kart.airborne = false;
  } else if (!kart.airborne && ramp && next.progress > ramp.end && forward < 15 &&
      kart.speed > 8 && position.distance <= position.width / 2 + TRACK_SHOULDER) {
    kart.airborne = true; kart.elevation = ramp.height;
    kart.verticalVelocity = ramp.launchSpeed ?? 6;
  } else if (!kart.airborne && kart.elevation > ground + .5) {
    kart.airborne = true; kart.verticalVelocity = 0;
  }
  if (kart.airborne) {
    kart.elevation += kart.verticalVelocity * dt - 10 * dt * dt;
    kart.verticalVelocity -= 20 * dt;
    if (kart.elevation <= ground) { kart.elevation = ground; kart.verticalVelocity = 0; kart.airborne = false; }
  } else { kart.elevation = ground; kart.verticalVelocity = 0; }
  constrainToTrack(kart, { x: previousX, z: previousZ, elevation: previousElevation });
  const constrained = constrainTrackEvent(kart.x, kart.z, previousX, previousZ, kart.speed, kart.trackId, kart.eventStage, kart.eventLevel,
    { previous: previousElevation, current: kart.elevation });
  kart.x = constrained.x; kart.z = constrained.z; kart.speed = constrained.speed;
  const correctedGround = driveableGroundHeight(nearestDriveableTrack(kart.x, kart.z, track.id, kart.eventStage, kart.eventLevel), track.id, kart.elevation);
  if (kart.elevation <= correctedGround) { kart.elevation = correctedGround; kart.verticalVelocity = 0; kart.airborne = false; }
}

function constrainToTrack(kart: Kart, before: { x: number; z: number; elevation: number }): void {
  const at = (fraction: number) => {
    const x = before.x + (kart.x - before.x) * fraction, z = before.z + (kart.z - before.z) * fraction;
    const near = nearestDriveableTrack(x, z, kart.trackId, kart.eventStage, kart.eventLevel);
    const distance = near.distance - near.width / 2 - trackBoundaryShoulder(near.progress, kart.trackId, near.branchId);
    return { x, z, near, distance };
  };
  const start = at(0), end = at(1), leaving = start.distance <= 1e-7 && end.distance > 1e-7;
  const entering = start.distance > 1e-7 && end.distance <= 1e-7;
  // Once a jump has cleared the rail, being outside does not teleport the kart
  // back. It may land on the terrain and return through a gap, jump, or reset.
  if (!leaving && !entering) return;
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 14; iteration++) {
    const middle = (low + high) / 2;
    if ((at(middle).distance <= 0) === leaving) low = middle; else high = middle;
  }
  const fraction = (low + high) / 2, contact = at(fraction);
  if (!contact.near.branchId && trackBoundaryGap(contact.x, contact.z, kart.trackId, kart.eventStage, kart.eventLevel)) return;
  const base = trackElevation(contact.near.progress, kart.trackId);
  const foot = before.elevation + (kart.elevation - before.elevation) * fraction;
  if (foot >= base + trackBoundaryHeight(contact.near.progress, kart.trackId, contact.near.branchId) || foot + KART_COLLISION_HEIGHT <= base) return;
  // Keep the tangential part of the motion: a kart pressing against a rail
  // still slides along it instead of becoming pinned at the first contact.
  const boundary = end.near.width / 2 + trackBoundaryShoulder(end.near.progress, kart.trackId, end.near.branchId);
  if (end.near.distance > 1e-7) {
    const radius = boundary + (leaving ? -.001 : .001);
    kart.x = end.near.x + (end.x - end.near.x) / end.near.distance * radius;
    kart.z = end.near.z + (end.z - end.near.z) / end.near.distance * radius;
  } else {
    const stopped = at(Math.max(0, low - .002)); kart.x = stopped.x; kart.z = stopped.z;
  }
  kart.speed *= .72; kart.lateralVelocity *= .5;
}

function random(world: World): number {
  world.seed = (Math.imul(world.seed, 1664525) + 1013904223) >>> 0;
  return world.seed / 0x100000000;
}

function advanceCheckpoint(kart: Kart, before: { x: number; z: number }, world: World): void {
  const track = getTrack(world.trackId);
  const checkpoints = track.checkpoints;
  const epsilon = 1e-7;
  let lastCrossing = -1;
  // A compressed branch can place two ordered gates in a single movement
  // segment. Process only physical intersections, in increasing segment order.
  for (let visited = 0; visited < checkpoints.length && !kart.finished; visited++) {
    const gates = eventCheckpointGates(track.id, kart.nextCheckpoint, kart.eventStage, kart.eventLevel);
    let crossing: { gate: typeof gates[number]; fraction: number } | undefined;
    for (const gate of gates) {
      const dx = Math.sin(gate.angle), dz = Math.cos(gate.angle);
      const previousSide = (before.x - gate.x) * dx + (before.z - gate.z) * dz;
      const currentSide = (kart.x - gate.x) * dx + (kart.z - gate.z) * dz;
      const forwardMotion = currentSide - previousSide;
      // Starting on the plane is valid when moving forward. A stationary kart,
      // reverse crossing or a gate already behind this segment never qualifies.
      if (previousSide > epsilon || currentSide < -epsilon || forwardMotion <= epsilon) continue;
      const fraction = clamp(-previousSide / forwardMotion, 0, 1);
      if (fraction <= lastCrossing + epsilon) continue;
      const crossX = before.x + (kart.x - before.x) * fraction;
      const crossZ = before.z + (kart.z - before.z) * fraction;
      const across = (crossX - gate.x) * dz - (crossZ - gate.z) * dx;
      if (Math.abs(across) > gate.width / 2 + TRACK_SHOULDER + epsilon) continue;
      if (!crossing || fraction < crossing.fraction) crossing = { gate, fraction };
    }
    if (!crossing) break;
    const { gate, fraction } = crossing;
    lastCrossing = fraction;
    kart.respawnX = gate.x + Math.sin(gate.angle) * 2;
    kart.respawnZ = gate.z + Math.cos(gate.angle) * 2;
    kart.respawnAngle = gate.angle;
    if (kart.nextCheckpoint === 0) {
      kart.lap++;
      if (kart.lap >= getTrackLapCount(track.id)) {
        kart.finished = true;
        kart.finishTime = world.raceTime;
        kart.progress = getTrackLapCount(track.id) * track.length;
        kart.speed = 0;
        if (world.finishTimeout === 0) world.finishTimeout = FINISH_GRACE_SECONDS;
      }
    }
    kart.nextCheckpoint = (kart.nextCheckpoint + 1) % checkpoints.length;
  }
  if (!kart.finished) {
    const near = nearestDriveableTrack(kart.x, kart.z, track.id, kart.eventStage, kart.eventLevel);
    // Bound ranking to the checkpoint interval already validated. Driving back
    // over the finish, skipping a gate or resetting cannot manufacture a lap.
    const last = kart.nextCheckpoint === 0 ? checkpoints.length - 1 : kart.nextCheckpoint - 1;
    const minimum = checkpoints[last]!.progress;
    const maximum = kart.nextCheckpoint === 0 ? track.length : checkpoints[kart.nextCheckpoint]!.progress;
    let localProgress = near.progress;
    if (kart.nextCheckpoint === 1 && localProgress > track.length * 0.9) localProgress -= track.length;
    kart.progress = kart.lap * track.length + clamp(localProgress, minimum - 15, maximum);
  }
}

function activeOpponent(kart: Kart, ownerId: string, world?: World): boolean {
  const owner = world?.teamMode ? world.players.find(player => player.id === ownerId) : undefined;
  return kart.id !== ownerId && (!owner || owner.team !== kart.team) && kart.connected && !kart.finished && !kart.spectator && !kart.abandoned;
}

/** Uses checkpoint-validated progress (including laps), never a client rank. */
function itemTarget(world: World, owner: Kart, leader: boolean): Kart | undefined {
  return world.players.filter(kart => activeOpponent(kart, owner.id, world) && kart.progress > owner.progress + 0.1)
    .sort((a, b) => (leader ? b.progress - a.progress : a.progress - b.progress) || a.id.localeCompare(b.id))[0];
}

function awardItem(world: World, kart: Kart): void {
  const active = world.players.filter(player => !player.spectator && !player.finished && !player.abandoned && player.connected);
  const ahead = active.filter(player => player.progress > kart.progress + 0.1).length;
  // Front runners get defensive tools; trailing drivers have more recovery tools.
  // A solo driver never receives a projectile that requires another racer.
  const trailing = ahead > 0 && ahead >= (active.length - 1) / 2;
  const weights = ahead === 0 ? [35, 10, 20, 20, 0, 0, 3, 12]
    : trailing ? [12, 25, 5, 8, 18, 12, 14, 6] : [22, 18, 12, 15, 18, 5, 5, 5];
  let roll = random(world) * 100;
  let item: typeof ITEMS[number] = 'turbo';
  for (let i = 0; i < ITEMS.length; i++) { roll -= weights[i]!; if (roll < 0) { item = ITEMS[i]!; break; } }
  kart.item = item;
  kart.itemCharges = item === 'tripleTurbo' ? 3 : 1;
}

function useItem(world: World, kart: Kart): void {
  if (!kart.item) return;
  if (kart.item === 'turbo' || kart.item === 'tripleTurbo') {
    kart.boost = Math.max(kart.boost, kart.item === 'turbo' ? 2.2 : 1.65);
    if (kart.item === 'tripleTurbo') {
      kart.itemCharges = Math.max(0, kart.itemCharges - 1);
      if (kart.itemCharges > 0) return;
    }
  } else if (kart.item === 'star') {
    kart.invincible = STAR_SECONDS; kart.stun = 0; kart.hitGrace = 0;
    kart.boost = Math.max(kart.boost, STAR_SECONDS);
  } else if (kart.item === 'shield') kart.shield = SHIELD_SECONDS;
  else {
    const forward = kart.item !== 'trap';
    const target = kart.item === 'seeker' || kart.item === 'leaderBolt'
      ? itemTarget(world, kart, kart.item === 'leaderBolt') : undefined;
    if ((kart.item === 'seeker' || kart.item === 'leaderBolt') && !target) {
      // The opponent may have finished or disconnected while this item was held.
      kart.boost = Math.max(kart.boost, 1.2);
    } else {
      // Bounded server state even when all eight drivers save traps for one area.
      const ownObjects = world.objects.filter(object => object.owner === kart.id);
      if (ownObjects.length >= 4) world.objects = world.objects.filter(object => object !== ownObjects[0]);
      if (world.objects.length >= MAX_WORLD_OBJECTS) world.objects.shift();
      const distance = forward ? 3 : -3;
      world.objects.push({ id: `${world.round}-${kart.id}-${Math.floor(world.time * 1000)}-${world.seed}`,
        kind: kart.item, x: kart.x + Math.sin(kart.angle) * distance,
        z: kart.z + Math.cos(kart.angle) * distance, angle: kart.angle, owner: kart.id,
        ttl: kart.item === 'projectile' ? 4 : kart.item === 'seeker' ? 9 : 18,
        ...(target ? { targetId: target.id } : {}) });
    }
  }
  kart.item = ''; kart.itemCharges = 0;
}

function hitKart(kart: Kart): void {
  if (kart.invincible > 0 || kart.hitGrace > 0) return;
  if (kart.shield > 0) { kart.shield = 0; kart.hitGrace = 0.6; return; }
  kart.stun = 1.05; kart.hitGrace = 1.7;
  kart.speed *= 0.2; kart.boost = 0; kart.driftCharge = 0;
}

function collideKarts(players: Kart[], teamMode = false): void {
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i]!;
    const b = players[j]!;
    const beforeA = { x: a.x, z: a.z, elevation: a.elevation }, beforeB = { x: b.x, z: b.z, elevation: b.elevation };
    if (a.loopId || b.loopId) {
      const poseA = kartLoopPose(a), poseB = kartLoopPose(b);
      const dx = poseB.x - poseA.x, dy = poseB.y - poseA.y, dz = poseB.z - poseA.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= 2.5) continue;
      if (a.invincible > 0 || b.invincible > 0) {
        if (a.invincible > 0 && b.invincible === 0 && (!teamMode || a.team !== b.team)) hitKart(b);
        if (b.invincible > 0 && a.invincible === 0 && (!teamMode || a.team !== b.team)) hitKart(a);
        continue;
      }
      const normal = distance < .001 ? poseA.right : { x: dx / distance, y: dy / distance, z: dz / distance };
      const massA = getKartStats(a.build).mass, massB = getKartStats(b.build).mass;
      const shareA = massB / (massA + massB), shareB = 1 - shareA;
      const aNormal = dot3(poseA.tangent, normal), bNormal = dot3(poseB.tangent, normal);
      const closingSpeed = a.speed * aNormal - b.speed * bNormal;
      moveAlongSurface(a, normal, -(2.5 - distance) * shareA);
      moveAlongSurface(b, normal, (2.5 - distance) * shareB);
      if (closingSpeed > 0) {
        a.speed = clamp(a.speed - closingSpeed * shareA * aNormal, -9, 46);
        b.speed = clamp(b.speed + closingSpeed * shareB * bNormal, -9, 46);
      }
      constrainToTrack(a, beforeA); constrainToTrack(b, beforeB);
      for (const kart of [a, b]) if (kart.loopId)
        kart.elevation = trackElevation(nearestTrack(kart.x, kart.z, kart.trackId).progress, kart.trackId);
      continue;
    }
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= 2.5 || Math.abs(a.elevation - b.elevation) > 1.8) continue;
    if (a.invincible > 0 || b.invincible > 0) {
      if (a.invincible > 0 && b.invincible === 0 && (!teamMode || a.team !== b.team)) hitKart(b);
      if (b.invincible > 0 && a.invincible === 0 && (!teamMode || a.team !== b.team)) hitKart(a);
      // Energy lets the protected kart pass through traffic without changing
      // its trajectory; ordinary karts keep the existing collision response.
      continue;
    }
    const nx = distance < 0.001 ? 1 : dx / distance;
    const nz = distance < 0.001 ? 0 : dz / distance;
    const massA = getKartStats(a.build).mass, massB = getKartStats(b.build).mass;
    const shareA = massB / (massA + massB), shareB = 1 - shareA;
    const push = 2.5 - distance;
    a.x -= nx * push * shareA; a.z -= nz * push * shareA;
    b.x += nx * push * shareB; b.z += nz * push * shareB;
    const aNormal = Math.sin(a.angle) * nx + Math.cos(a.angle) * nz;
    const bNormal = Math.sin(b.angle) * nx + Math.cos(b.angle) * nz;
    const closingSpeed = a.speed * aNormal - b.speed * bNormal;
    // Equal-speed neighbours retain momentum. Only approaching karts exchange
    // an impulse, preventing traffic jams caused by damping on every tick.
    if (closingSpeed > 0) {
      a.speed = clamp(a.speed - closingSpeed * shareA * aNormal, -9, 46);
      b.speed = clamp(b.speed + closingSpeed * shareB * bNormal, -9, 46);
    }
    constrainToTrack(a, beforeA); constrainToTrack(b, beforeB);
    for (const [kart, before] of [[a, beforeA], [b, beforeB]] as const) {
      const constrained = constrainTrackEvent(kart.x, kart.z, before.x, before.z, kart.speed, kart.trackId, kart.eventStage, kart.eventLevel,
        { previous: before.elevation, current: kart.elevation });
      kart.x = constrained.x; kart.z = constrained.z; kart.speed = constrained.speed;
    }
  }
}

function dot3(a: LoopVector, b: LoopVector): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function moveAlongSurface(kart: Kart, normal: LoopVector, amount: number): void {
  if (!kart.loopId) { kart.x += normal.x * amount; kart.z += normal.z * amount; return; }
  const near = nearestTrack(kart.x, kart.z, kart.trackId), pose = trackLoopPose(near.progress, kart.trackId);
  const along = dot3(normal, pose.tangent) * amount * pose.speedScale, across = dot3(normal, pose.right) * amount;
  kart.x += Math.sin(near.angle) * along + Math.cos(near.angle) * across;
  kart.z += Math.cos(near.angle) * along - Math.sin(near.angle) * across;
}

function objectPose(x: number, z: number, world: World): LoopVector {
  const near = nearestDriveableTrack(x, z, world.trackId, world.eventStage, world.eventLevel);
  if (!near.branchId && trackLoopAt(near.progress, world.trackId)) {
    const across = (x - near.x) * Math.cos(near.angle) - (z - near.z) * Math.sin(near.angle);
    const pose = trackLoopPose(near.progress, world.trackId, across);
    return { x: pose.x + pose.up.x * .7, y: pose.y + pose.up.y * .7, z: pose.z + pose.up.z * .7 };
  }
  return { x, y: trackElevation(near.progress, world.trackId) + .7, z };
}

function stepObjects(world: World, racers: Kart[], dt: number): void {
  for (const object of world.objects) {
    object.ttl -= dt;
    const before = { x: object.x, z: object.z };
    const roadBefore = nearestDriveableTrack(object.x, object.z, world.trackId, world.eventStage, world.eventLevel);
    const loopBefore = !roadBefore.branchId ? trackLoopAt(roadBefore.progress, world.trackId) : undefined;
    const move = (speed: number) => {
      const pose = loopBefore ? trackLoopPose(roadBefore.progress, world.trackId) : undefined;
      const delta = object.angle - roadBefore.angle;
      const along = Math.cos(delta) * speed * (pose?.speedScale ?? 1), across = Math.sin(delta) * speed;
      object.x += (Math.sin(roadBefore.angle) * along + Math.cos(roadBefore.angle) * across) * dt;
      object.z += (Math.cos(roadBefore.angle) * along - Math.sin(roadBefore.angle) * across) * dt;
    };
    if (object.kind === 'projectile') {
      move(62);
      const road = nearestDriveableTrack(object.x, object.z, world.trackId, world.eventStage, world.eventLevel);
      if (road.distance > road.width / 2 + 5) object.ttl = 0;
    } else if (object.kind === 'seeker' || object.kind === 'leaderBolt') {
      const owner = world.players.find(kart => kart.id === object.owner);
      let target = racers.find(kart => kart.id === object.targetId && activeOpponent(kart, object.owner, world));
      if (object.kind === 'leaderBolt' && owner) target = itemTarget(world, owner, true);
      if (!target) { object.ttl = 0; continue; }
      object.targetId = target.id;
      const near = nearestDriveableTrack(object.x, object.z, world.trackId, world.eventStage, world.eventLevel);
      const close = Math.hypot(target.x - object.x, target.z - object.z) < 22;
      const waypoint = close ? target : eventRoutePoint(near.progress + 11, world.trackId, world.eventStage, world.eventLevel);
      const desired = Math.atan2(waypoint.x - object.x, waypoint.z - object.z);
      const turn = Math.atan2(Math.sin(desired - object.angle), Math.cos(desired - object.angle));
      object.angle += clamp(turn, -7 * dt, 7 * dt);
      const speed = object.kind === 'leaderBolt' ? 82 : 64;
      move(speed);
    }
    if (object.ttl <= 0) continue;
    const from = objectPose(before.x, before.z, world), to = objectPose(object.x, object.z, world);
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    const victim = racers.find(kart => {
      if (!activeOpponent(kart, object.owner, world) || (object.kind === 'leaderBolt' && kart.id !== object.targetId)) return false;
      // Swept intersection prevents fast projectiles from tunnelling through a
      // kart during a capped 100 ms tick. Protected karts still absorb the shot.
      const pose = kartLoopPose(kart);
      const x = pose.x + pose.up.x * .7, y = pose.y + pose.up.y * .7, z = pose.z + pose.up.z * .7;
      const t = distanceSquared ? clamp(((x - from.x) * dx + (y - from.y) * dy + (z - from.z) * dz) / distanceSquared, 0, 1) : 0;
      return Math.hypot(x - from.x - t * dx, y - from.y - t * dy, z - from.z - t * dz) < 2.5;
    });
    if (victim) {
      hitKart(victim);
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
  world.eventStage = Math.max(world.eventStage, Math.min(getTrackLapCount(world.trackId)-1, Math.max(0, ...world.players.filter(kart => !kart.spectator && !kart.abandoned).map(kart => kart.lap))));
  for (const kart of world.players) { kart.eventStage = world.eventStage; kart.eventLevel = world.eventLevel; }
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
  collideKarts(racers, world.teamMode);
  for (const kart of racers) advanceCheckpoint(kart, previousPositions.get(kart.id)!, world);
  stepObjects(world, racers.filter(kart => !kart.finished), dt);
  for (const pickup of world.pickups) {
    pickup.cooldown = Math.max(0, pickup.cooldown - dt);
    if (pickup.cooldown > 0) continue;
    const kart = racers.find(player => player.connected && !player.finished && !player.item && Math.hypot(player.x - pickup.x, player.z - pickup.z) < 2.8);
    if (kart) { awardItem(world, kart); pickup.cooldown = 7; }
  }
  const ordered = standings(world);
  ordered.forEach((kart, index) => { kart.rank = index + 1; });
  if (ordered.every(kart => kart.finished || kart.abandoned) || world.finishTimeout === 1e-8 || world.raceTime >= getTrackRaceTimeLimit(world.trackId)) {
    world.phase = 'finished';
    for (const kart of world.players) kart.speed = 0;
  }
}
