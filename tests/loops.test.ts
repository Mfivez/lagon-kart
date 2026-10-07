import test from 'node:test';
import assert from 'node:assert/strict';
import { createKart, createWorld, neutralInput, resetKart, startRace, stepKart, stepWorld } from '../shared/game.js';
import { autopilot } from '../shared/autopilot.js';
import { TRACKS, nearestTrack, trackElevation, trackPoint } from '../shared/track.js';
import { getTrackEvent } from '../shared/track-events.js';
import { kartLoopPose, trackLoopAt, trackLoopPose } from '../shared/track-loop.js';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;
const dt = 1 / 30;
for (const track of TRACKS.filter(track => track.loops.length)) {
  const loop = track.loops[0]!;
  test(`${track.id}: magnetic loop is a continuous 3D road with an inverted top and separated branches`, () => {
    for (const progress of [loop.start, loop.end]) {
      const pose = trackLoopPose(progress, track.id), road = trackPoint(progress, track.id);
      assert.ok(Math.hypot(pose.x - road.x, pose.y, pose.z - road.z) < 1e-6);
      assert.ok(pose.up.y > .99999);
      assert.ok(Math.abs(pose.speedScale - 1) < .002, 'no speed step at the join');
    }
    const summit = trackLoopPose((loop.start + loop.end) / 2, track.id);
    assert.ok(Math.abs(summit.y - loop.height) < 1e-6);
    assert.ok(summit.up.y < -.99, 'kart and surface must actually be upside down');
    for (let i = 0; i <= 200; i++) {
      const pose = trackLoopPose(loop.start + i / 200 * (loop.end - loop.start), track.id);
      for (const vector of [pose.right, pose.up, pose.tangent]) assert.ok(Math.abs(dot(vector, vector) - 1) < 1e-8);
      assert.ok(Math.abs(dot(pose.right, pose.up)) < 1e-8);
      assert.ok(Math.abs(dot(pose.up, pose.tangent)) < 1e-8);
      assert.ok(Number.isFinite(pose.speedScale) && pose.speedScale > .1 && pose.speedScale < 5);
      if (i > 0 && i < 200) for (const side of [-1, 1]) {
        const progress = loop.start + i / 200 * (loop.end - loop.start);
        const before = trackLoopPose(progress - .02, track.id, side * track.width / 2);
        const after = trackLoopPose(progress + .02, track.id, side * track.width / 2);
        assert.ok(dot({ x: after.x - before.x, y: after.y - before.y, z: after.z - before.z }, pose.tangent) > .01,
          'the inside edge of a wide ribbon must never fold backwards');
      }
    }
    for (const branch of getTrackEvent(track.id, 2, 3).branches)
      assert.ok(branch.start >= loop.end + 8 || branch.end <= loop.start - 8, 'a branch cannot enter a folded road');
    assert.ok(track.elevations.every(feature => feature.start > loop.end + 8 || feature.end < loop.start - 8));
  });

  test(`${track.id}: ordinary inputs drive the full loop identically on server and predicted kart`, () => {
    const kart = createKart('loop', 'Loop', '#fc735d', 0, track.id);
    Object.assign(kart, trackPoint(loop.start - 2, track.id), { speed: 25 });
    const predicted = structuredClone(kart);
    let attached = false, inverted = false, released = false, peak = 0, travelled = 0;
    let previous = kartLoopPose(kart);
    for (let tick = 0; tick < 900; tick++) {
      const input = { ...autopilot(kart, tick), reset: false };
      stepKart(kart, input, dt); stepKart(predicted, input, dt);
      assert.deepEqual(kart, predicted);
      const pose = kartLoopPose(kart);
      const distance = Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z);
      assert.ok(distance < 2.3, `continuous real motion, got ${distance}m in one frame`);
      travelled += distance; previous = pose;
      attached ||= Boolean(kart.loopId); inverted ||= pose.up.y < -.9; peak = Math.max(peak, pose.y);
      assert.equal(kart.airborne, false, 'the magnetic road retains contact even upside down');
      if (attached && !kart.loopId) { released = true; break; }
    }
    assert.ok(attached && inverted && released);
    assert.ok(peak > loop.height - .2);
    assert.ok(travelled > (loop.end - loop.start) * 1.5, 'the physical looping is longer than its ground projection');
    assert.ok(kart.speed > 10);
  });

  test(`${track.id}: braking, restarting, reversing and reset all work on a magnetic loop`, () => {
    const kart = createKart('slow', 'Slow', '#fc735d', 0, track.id);
    const middle = (loop.start + loop.end) / 2;
    Object.assign(kart, trackPoint(middle, track.id), { elevation: loop.height, speed: 0, loopId: loop.id });
    const parked = kartLoopPose(kart);
    for (let tick = 0; tick < 90; tick++) stepKart(kart, { ...neutralInput(), brake: true }, dt);
    assert.deepEqual(kartLoopPose(kart), parked);
    assert.equal(kart.airborne, false);
    for (let tick = 0; tick < 30; tick++) stepKart(kart, { ...neutralInput(), throttle: 1 }, dt);
    assert.ok(nearestTrack(kart.x, kart.z, track.id).progress > middle + 1);
    assert.ok(kart.speed > 8);
    Object.assign(kart, trackPoint(middle, track.id), { elevation: loop.height, speed: -7 });
    for (let tick = 0; tick < 30; tick++) stepKart(kart, { ...neutralInput(), throttle: -1 }, dt);
    assert.ok(nearestTrack(kart.x, kart.z, track.id).progress < middle - 2);
    const progress = kart.progress, checkpoint = kart.nextCheckpoint;
    resetKart(kart);
    assert.equal(kart.loopId, ''); assert.equal(kart.elevation, 0);
    assert.equal(kart.progress, progress); assert.equal(kart.nextCheckpoint, checkpoint);
  });

  test(`${track.id}: objects on the magnetic road respect altitude and leave the kart beneath it untouched`, () => {
    const world = createWorld(false, track.id);
    const upper = createKart('upper', 'Upper', '#fc735d', 0, track.id), lower = createKart('lower', 'Lower', '#69cbd0', 1, track.id);
    world.players = [lower, upper]; startRace(world); world.phase = 'racing';
    const middle = (loop.start + loop.end) / 2;
    Object.assign(upper, trackPoint(middle, track.id), { elevation: loop.height, loopId: loop.id });
    Object.assign(lower, trackPoint(middle, track.id), { elevation: 0, airborne: true, verticalVelocity: 0 });
    world.objects = [{ id: 'mine', owner: 'another-racer', kind: 'trap', x: lower.x, z: lower.z, angle: lower.angle, ttl: 10 }];
    // Traps cling to their road: this one occupies the upper magnetic surface.
    // The ground kart must remain untouched despite sharing its logical X/Z.
    stepWorld(world, new Map(), dt);
    assert.equal(lower.stun, 0);
    assert.equal(upper.stun, 1.05);
    assert.equal(lower.x, trackPoint(middle, track.id).x);
    assert.equal(trackLoopAt(middle, track.id)?.id, loop.id);
    assert.equal(trackElevation(middle, track.id), loop.height);
    for (let tick = 0; tick < 30; tick++) stepKart(lower, neutralInput(), dt);
    assert.equal(lower.elevation, 0, 'driving under the road must not teleport up into the loop');
    assert.equal(lower.loopId, '');
  });
}
