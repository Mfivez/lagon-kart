import test from 'node:test';
import assert from 'node:assert/strict';
import { createKart, neutralInput, stepKart, type Kart } from '../shared/game.js';
import { TRACKS, trackPoint, trackElevation, type TrackDefinition } from '../shared/track.js';
import { kartLoopPose, kartLoopRoadPosition } from '../shared/track-loop.js';

function driver(track: TrackDefinition, fraction: number, speed = 24): Kart {
  const loop = track.loops[0]!, progress = loop.start + fraction * (loop.end - loop.start);
  const kart = createKart('driver', 'Driver', '#fc735d', 0, track.id);
  Object.assign(kart, trackPoint(progress, track.id), { routeProgress: progress, loopId: loop.id,
    elevation: trackElevation(progress, track.id), speed });
  return kart;
}
function lateral(kart: Kart): number {
  const road = kartLoopRoadPosition(kart)!;
  return (kart.x - road.x) * Math.cos(road.angle) - (kart.z - road.z) * Math.sin(road.angle);
}
function yaw(kart: Kart): number {
  const road = kartLoopRoadPosition(kart)!;
  return Math.atan2(Math.sin(kart.angle - road.angle), Math.cos(kart.angle - road.angle));
}
for (const track of TRACKS.filter(track => track.loops.length)) {
  test(`${track.id}: ordinary acceleration follows the curved looping without constant steering corrections`, () => {
    const loop = track.loops[0]!, kart = driver(track, .001), predicted = structuredClone(kart);
    const nextCheckpoint = kart.nextCheckpoint;
    let inverted = false, released = false;
    for (let tick = 0; tick < 600; tick++) {
      const input = { ...neutralInput(tick), throttle: 1 };
      stepKart(kart, input, 1 / 30); stepKart(predicted, input, 1 / 30);
      assert.deepEqual(predicted, kart);
      assert.equal(kart.airborne, false);
      if (!kart.loopId) { released = true; break; }
      assert.ok(Math.abs(lateral(kart)) < .001, 'neutral steering follows the local road instead of its ground chord');
      inverted ||= kartLoopPose(kart).up.y < -.9;
    }
    assert.ok(inverted && released, 'the kart must actually traverse the summit and leave by the exit');
    assert.ok(kart.routeProgress! >= loop.end, 'no premature exit or progress jump');
    assert.equal(kart.lap, 0); assert.equal(kart.nextCheckpoint, nextCheckpoint, 'prediction never awards checkpoints');
  });

  test(`${track.id}: left and right keep the same local meaning uphill, inverted and downhill`, () => {
    for (const fraction of [.22, .5, .72]) for (const steer of [-1, -.35, .35, 1]) {
      const kart = driver(track, fraction, 18);
      for (let tick = 0; tick < 18; tick++) stepKart(kart, { ...neutralInput(tick), throttle: 1, steer }, 1 / 60);
      assert.ok(lateral(kart) * Math.sign(steer) > .3, `input ${steer} must move into its own lane at ${fraction}`);
      assert.ok(yaw(kart) * Math.sign(steer) > .1 && Math.abs(yaw(kart)) < .55, 'steering stays responsive without rotating sideways');
      const displaced = lateral(kart);
      for (let tick = 0; tick < 45; tick++) stepKart(kart, { ...neutralInput(tick), throttle: 1 }, 1 / 60);
      assert.ok(Math.abs(yaw(kart)) < .01, 'releasing the control smoothly aligns the kart with the road');
      assert.ok(Math.abs(lateral(kart) - displaced) < 2.5, 'release does not keep sliding until the rail');
      assert.equal(kart.airborne, false);
    }
  });

  test(`${track.id}: assistance does not propel a stopped kart or turn a loop into automatic race progress`, () => {
    const kart = driver(track, .5, 0), before = structuredClone(kart), point = kartLoopPose(kart);
    for (let tick = 0; tick < 120; tick++) stepKart(kart, { ...neutralInput(tick), steer: tick % 2 ? -1 : 1, brake: true }, 1 / 30);
    const after = kartLoopPose(kart);
    assert.deepEqual({ x: after.x, y: after.y, z: after.z }, { x: point.x, y: point.y, z: point.z });
    assert.equal(kart.routeProgress, before.routeProgress); assert.equal(kart.speed, 0);
    assert.equal(kart.lap, before.lap); assert.equal(kart.nextCheckpoint, before.nextCheckpoint);
    assert.equal(kart.progress, before.progress); assert.equal(kart.finished, false);
  });
}
