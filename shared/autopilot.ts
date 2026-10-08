// Shared CPU/test driver: sends ordinary bounded commands through the public input
// contract. It never sets position, progress, inventory or race results.
import { getTrack, neutralInput, type Input, type Kart } from './game.js';
import { constrainTrackEvent, dynamicSurface, eventRoutePoint, getTrackEvent, nearestDriveableTrack,
  pointOnBranch, trackBoundaryGap, type DriveablePosition } from './track-events.js';
import { nearestTrack, trackElevation, trackPoint, type Vec2 } from './track.js';
import { KART_COLLISION_HEIGHT, trackBoundaryHeight, trackBoundaryShoulder } from './obstacle-heights.js';

export type AutopilotDriver = Pick<Kart, 'trackId' | 'x' | 'z' | 'speed' | 'angle' | 'nextCheckpoint' | 'resetCooldown' |
  'resetLatch' | 'item' | 'itemLatch' | 'epoch'> & Partial<Pick<Kart, 'eventStage' | 'eventLevel' | 'elevation' | 'airborne' | 'routeProgress' | 'progress'>>;

/** A late closure must not send a driver sideways through an unrelated road's rail. */
export function drivingRoute(kart: AutopilotDriver, near: DriveablePosition,
  stage = kart.eventStage ?? 0, level = kart.eventLevel ?? 0) {
  const track = getTrack(kart.trackId), event = getTrackEvent(track.id, stage, level);
  const detour = event.branches.find(route => route.kind === 'detour');
  const committed = event.branches.find(route => route.open && route.id === near.branchId);
  const pastClosure = !near.branchId && event.blockers.length > 0 && detour &&
    near.progress > detour.start && near.progress < detour.end && event.blockers.every(blocker =>
      near.progress > nearestTrack(blocker.x, blocker.z, track.id).progress + blocker.halfLength + .95);
  const approaching = !pastClosure && event.blockers.length > 0 && detour &&
    near.progress >= detour.start - 30 && near.progress <= detour.end + 8;
  const branch = committed ?? (approaching ? detour : undefined);
  return { branch, point(progress: number): Vec2 & { angle: number } {
    if (committed && progress >= committed.start && progress <= committed.end) return pointOnBranch(committed, progress);
    if (pastClosure && progress <= detour!.end) return trackPoint(progress, track.id);
    return eventRoutePoint(progress, track.id, stage, level);
  } };
}

function pressingRail(kart: AutopilotDriver, near: DriveablePosition, target: Vec2, stage: number, level: number): boolean {
  const boundary = near.width / 2 + trackBoundaryShoulder(near.progress, kart.trackId, near.branchId);
  // Only recover actual contact, not a long chord that cuts across a normal turn.
  if (Math.abs(near.distance - boundary) > .15) return false;
  const distance = Math.hypot(target.x - kart.x, target.z - kart.z);
  if (distance < .01) return false;
  const at = (fraction: number) => {
    const x = kart.x + (target.x - kart.x) / distance * 2 * fraction;
    const z = kart.z + (target.z - kart.z) / distance * 2 * fraction;
    const road = nearestDriveableTrack(x, z, kart.trackId, stage, level, { progress: near.progress, elevation: kart.elevation });
    return { x, z, road, inside: road.distance <= road.width / 2 + trackBoundaryShoulder(road.progress, kart.trackId, road.branchId) };
  };
  const start = at(0);
  if (start.inside === at(1).inside) return false;
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) { const mid = (low + high) / 2; if (at(mid).inside === start.inside) low = mid; else high = mid; }
  const contact = at((low + high) / 2);
  if (!contact.road.branchId && trackBoundaryGap(contact.x, contact.z, kart.trackId, stage, level)) return false;
  const base = trackElevation(contact.road.progress, kart.trackId), foot = kart.elevation ?? base;
  return foot < base + trackBoundaryHeight(contact.road.progress, kart.trackId, contact.road.branchId) && foot + KART_COLLISION_HEIGHT > base;
}

export function autopilot(kart: AutopilotDriver, seq: number, useItems = false): Input {
  const track = getTrack(kart.trackId);
  const stage = kart.eventStage ?? 0, level = kart.eventLevel ?? 0;
  const near = nearestDriveableTrack(kart.x, kart.z, track.id, stage, level, { progress: kart.routeProgress ?? kart.progress, elevation: kart.elevation });
  const event = getTrackEvent(track.id, stage, level);
  const route = drivingRoute(kart, near, stage, level);
  const lookahead = route.branch ? Math.max(8, kart.speed * .45) : Math.max(9, kart.speed * .58);
  const target = route.point(near.progress + lookahead);
  const desired = Math.atan2(target.x - kart.x, target.z - kart.z);
  const difference = Math.atan2(Math.sin(desired - kart.angle), Math.cos(desired - kart.angle));
  const ahead = route.point(near.progress + 25);
  const curvature = Math.abs(Math.atan2(Math.sin(ahead.angle - near.angle), Math.cos(ahead.angle - near.angle))) / 25;
  const iceAhead = dynamicSurface(target.x, target.z, track.id, stage, level, nearestDriveableTrack(target.x, target.z, track.id, stage, level, { progress: near.progress + lookahead })).surface === 'ice';
  const targetSpeed = route.branch ? Math.min(32, route.branch.minTurnRadius * 1.05) : curvature > .045 ? 21 : curvature > .03 ? 26 : iceAhead ? 28 : 46;
  let localProgress = near.progress;
  if (kart.nextCheckpoint === 1 && localProgress > track.length * .9) localProgress -= track.length;
  if (kart.nextCheckpoint === 0 && localProgress < track.length * .2) localProgress += track.length;
  const nextGate = kart.nextCheckpoint === 0 ? track.length : track.checkpoints[kart.nextCheckpoint]!.progress;
  // Recovery uses the same reset control as a human after being bumped past a
  // checkpoint outside its gate. No state or progress is changed by this driver.
  const missedGate = localProgress > nextGate + 8;
  // A late closure or collision can leave the driver against a rail or debris
  // before its next gate. Recover through the same cooldown/latch as a human;
  // don't mistake a slow launch, open junction or genuine jump for a blockage.
  const slowOnGround = Math.abs(kart.speed) < 3 && !kart.airborne;
  const blockedRoute = slowOnGround && (pressingRail(kart, near, target, stage, level) || event.blockers.length > 0 &&
    [target, { x: kart.x + Math.sin(kart.angle) * 2, z: kart.z + Math.cos(kart.angle) * 2 }].some(point =>
      constrainTrackEvent(point.x, point.z, kart.x, kart.z, kart.speed, track.id, stage, level,
        kart.elevation === undefined ? undefined : { previous: kart.elevation, current: kart.elevation }).blocked));
  return { ...neutralInput(seq, kart.epoch), throttle: kart.speed > targetSpeed + 1 ? 0 : 1,
    brake: kart.speed > targetSpeed + 5,
    reset: (missedGate || blockedRoute) && kart.resetCooldown === 0 && !kart.resetLatch,
    steer: Math.max(-1, Math.min(1, difference * 2.6)),
    use: useItems && Boolean(kart.item) && !kart.itemLatch };
}
