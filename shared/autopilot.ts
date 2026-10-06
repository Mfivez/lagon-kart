// Test driver: sends ordinary bounded commands through the same public input
// contract. It never sets position, progress, inventory or race results.
import { getTrack, neutralInput, trackPoint, type Input, type Kart } from './game.js';
import { dynamicSurface, eventRoutePoint, getTrackEvent, nearestDriveableTrack } from './track-events.js';

export type AutopilotDriver = Pick<Kart, 'trackId' | 'x' | 'z' | 'speed' | 'angle' | 'nextCheckpoint' | 'resetCooldown' |
  'resetLatch' | 'item' | 'itemLatch' | 'epoch'> & Partial<Pick<Kart, 'eventStage' | 'eventLevel'>>;

export function autopilot(kart: AutopilotDriver, seq: number, useItems = false): Input {
  const track = getTrack(kart.trackId);
  const stage = kart.eventStage ?? 0, level = kart.eventLevel ?? 0;
  const near = nearestDriveableTrack(kart.x, kart.z, track.id, stage, level);
  const event = getTrackEvent(track.id, stage, level);
  const detour = event.branches.find(route => route.kind === 'detour');
  const approachingDetour = Boolean(event.blockers.length && detour && near.progress >= detour.start - 30 && near.progress <= detour.end + 8);
  const lookahead = approachingDetour ? Math.max(8, kart.speed * .45) : Math.max(9, kart.speed * .58);
  const target = eventRoutePoint(near.progress + lookahead, track.id, stage, level);
  const desired = Math.atan2(target.x - kart.x, target.z - kart.z);
  const difference = Math.atan2(Math.sin(desired - kart.angle), Math.cos(desired - kart.angle));
  const ahead = eventRoutePoint(near.progress + 25, track.id, stage, level);
  const curvature = Math.abs(Math.atan2(Math.sin(ahead.angle - near.angle), Math.cos(ahead.angle - near.angle))) / 25;
  const iceAhead = dynamicSurface(target.x, target.z, track.id, stage, level).surface === 'ice';
  const targetSpeed = approachingDetour ? Math.min(32, detour!.minTurnRadius * 1.05) : curvature > .045 ? 21 : curvature > .03 ? 26 : iceAhead ? 28 : 46;
  let localProgress = near.progress;
  if (kart.nextCheckpoint === 1 && localProgress > track.length * .9) localProgress -= track.length;
  if (kart.nextCheckpoint === 0 && localProgress < track.length * .2) localProgress += track.length;
  const nextGate = kart.nextCheckpoint === 0 ? track.length : track.checkpoints[kart.nextCheckpoint]!.progress;
  // Recovery uses the same reset control as a human after being bumped past a
  // checkpoint outside its gate. No state or progress is changed by this driver.
  const missedGate = localProgress > nextGate + 8;
  return { ...neutralInput(seq, kart.epoch), throttle: kart.speed > targetSpeed + 1 ? 0 : 1,
    brake: kart.speed > targetSpeed + 5,
    reset: missedGate && kart.resetCooldown === 0 && !kart.resetLatch,
    steer: Math.max(-1, Math.min(1, difference * 2.6)),
    use: useItems && Boolean(kart.item) && !kart.itemLatch };
}
