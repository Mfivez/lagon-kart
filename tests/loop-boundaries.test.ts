import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_TRACK_TEMPLATES, getTrackWorkshopStart, registerCustomTrack, type CustomTrackLoop } from '../shared/custom-tracks.js';
import { createKart, createWorld, neutralInput, resetKart, stepKart, stepWorld, type Kart } from '../shared/game.js';
import { TRACK_SHOULDER } from '../shared/obstacle-heights.js';
import { TRACKS, nearestTrack, trackElevation, trackPoint, type TrackDefinition } from '../shared/track.js';
import { kartLoopPose } from '../shared/track-loop.js';

const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
draft.name = 'Looping étroit'; draft.width = 4; draft.zones = [];
draft.loops = [{ start: .18, end: .3, height: 24, lateralSpread: 18 }];
const narrow = registerCustomTrack({ id: 'custom-loop-boundary-narrow', revision: 1, draft,
  createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' });
const tracks = [...TRACKS.filter(track => track.loops.length), narrow];

function onLoop(track: TrackDefinition, fraction: number, lateral = 0, id = 'driver'): Kart {
  const loop = track.loops[0]!, progress = loop.start + (loop.end - loop.start) * fraction;
  const point = trackPoint(progress, track.id), kart = createKart(id, id, '#fc735d', 0, track.id);
  Object.assign(kart, point, { x: point.x + Math.cos(point.angle) * lateral,
    z: point.z - Math.sin(point.angle) * lateral, routeProgress: progress, progress,
    elevation: trackElevation(progress, track.id), loopId: loop.id, speed: 30 });
  return kart;
}

/** Check actual world pose as well as logical X/Z: the original bug kept the
 * logical kart inside its rail but detached its pose, moving it 10–23 m. */
function assertContained(kart: Kart, track: TrackDefinition, context: string): void {
  const near = nearestTrack(kart.x, kart.z, track.id, { progress: kart.routeProgress, elevation: kart.elevation });
  const loop = track.loops[0]!;
  assert.ok(near.distance <= track.width / 2 + TRACK_SHOULDER + .015, `${context}: crossed the side rail`);
  if (near.progress > loop.start + .001 && near.progress < loop.end - .001) {
    assert.ok(near.distance + 1.2 <= track.width / 2 + TRACK_SHOULDER + .015, `${context}: body crossed the looping rail`);
    assert.equal(kart.loopId, loop.id, `${context}: detached in the middle of the looping`);
    assert.equal(kart.airborne, false, `${context}: fell through the magnetic surface`);
    assert.equal(kartLoopPose(kart).active, true, `${context}: lost its three-dimensional road pose`);
  }
  assert.ok([kart.x, kart.z, kart.angle, kart.elevation, kart.speed, kart.routeProgress].every(Number.isFinite), `${context}: non-finite state`);
}

for (const kind of ['overlapping', 'touching', 'duplicate'] as const) {
  test(`${kind} authored loopings compile into one continuous road without changing the source`, () => {
    const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
    draft.zones = [];
    const first: CustomTrackLoop = { start: .18, end: .3, height: 24, lateralSpread: 20 };
    draft.loops = kind === 'overlapping' ? [first, { ...first, start: .24, end: .36 }]
      : kind === 'touching' ? [{ ...first, end: .24 }, { ...first, start: .24 }]
        : Array.from({ length: 15 }, () => ({ ...first }));
    const saved = { id: `custom-loop-boundary-${kind}`, revision: 1, draft,
      createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' };
    const before = structuredClone(saved), track = registerCustomTrack(saved), loop = track.loops[0]!;
    assert.deepEqual(saved, before, 'compilation must preserve every editable source module');
    assert.equal(registerCustomTrack(structuredClone(saved)), track, 'registering an immutable version again returns its canonical object');
    assert.equal(track.loops.length, 1, 'a shared range owns exactly one physical and visible ribbon');
    assert.ok(Math.abs(loop.start / track.length - .18) < 1e-10);
    assert.ok(Math.abs(loop.end / track.length - (kind === 'overlapping' ? .36 : .3)) < 1e-10);
    for (const index of draft.loops.keys()) {
      const placement = getTrackWorkshopStart(track.id, { group: 'loops', index });
      assert.ok(placement, `source module ${index + 1} is still individually testable in the editor`);
      assert.equal(placement.end, loop.end);
      assert.ok(placement.progress < loop.start, 'testing any merged module starts before the full looping');
    }
    const kart = createKart('continuous', 'Continu', '#fc735d', 0, track.id);
    const progress = loop.start - 2;
    Object.assign(kart, trackPoint(progress, track.id), { routeProgress: progress, progress, speed: 25 });
    let entered = false, inverted = false, exited = false, pose = kartLoopPose(kart);
    for (let tick = 0; tick < 1200; tick++) {
      stepKart(kart, { ...neutralInput(tick), throttle: 1 }, 1 / 30);
      const next = kartLoopPose(kart), travelled = Math.hypot(next.x - pose.x, next.y - pose.y, next.z - pose.z);
      assert.ok(travelled < 2.3, `${kind}: road pose jumped ${travelled} m at tick ${tick}`);
      assert.equal(kart.airborne, false, 'the compiled ribbon has no gap through its surface');
      entered ||= next.active; inverted ||= next.active && next.up.y < -.8;
      if (entered && !next.active) { exited = true; break; }
      pose = next;
    }
    assert.ok(entered && inverted && exited, 'ordinary driving traverses the complete merged looping');
    assert.ok(kart.routeProgress! > loop.end, 'exit is at the end of the full combined range');
  });
}

test('merging keeps disjoint authored order and maps workshop selections after merged duplicates', () => {
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
  draft.loops = [
    { start: .6, end: .68, height: 24, lateralSpread: 20 },
    { start: .24, end: .32, height: 18, lateralSpread: 12 },
    { start: .2, end: .28, height: 30, lateralSpread: 24 },
    { start: .78, end: .82, height: 18, lateralSpread: 12 },
  ];
  const track = registerCustomTrack({ id: 'custom-loop-boundary-order', revision: 1, draft,
    createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' });
  assert.equal(track.loops.length, 3);
  assert.deepEqual(track.loops.map(loop => Math.round(loop.start / track.length * 100)), [60, 20, 78]);
  assert.equal(track.loops[1]!.height, 30); assert.equal(track.loops[1]!.lateralSpread, 24);
  assert.equal(getTrackWorkshopStart(track.id, { group: 'loops', index: 1 })!.end, track.loops[1]!.end);
  assert.equal(getTrackWorkshopStart(track.id, { group: 'loops', index: 2 })!.end, track.loops[1]!.end);
  assert.equal(getTrackWorkshopStart(track.id, { group: 'loops', index: 3 })!.end, track.loops[2]!.end);
  assert.equal(getTrackWorkshopStart(track.id, { group: 'loops', index: 4 }), undefined);
});

for (const track of tracks) {
  test(`${track.id}: sustained steering and turbo cannot detach the kart at a looping side rail`, () => {
    for (const steer of [-1, 1]) for (const boosted of [false, true]) for (const dt of [1 / 30, .1]) {
      const kart = onLoop(track, .3), predicted = structuredClone(kart);
      kart.speed = predicted.speed = boosted ? 46 : 30;
      kart.boost = predicted.boost = boosted ? 10 : 0;
      let before = kartLoopPose(kart);
      for (let tick = 0; tick < Math.ceil(8 / dt); tick++) {
        const input = { ...neutralInput(tick), throttle: 1, steer, drift: boosted };
        stepKart(kart, input, dt); stepKart(predicted, input, dt);
        const context = `steer ${steer}, boost ${boosted}, dt ${dt}, tick ${tick}`;
        assertContained(kart, track, context);
        assert.deepEqual(predicted, kart, `${context}: server and input replay differ`);
        const pose = kartLoopPose(kart), travelled = Math.hypot(pose.x - before.x, pose.y - before.y, pose.z - before.z);
        assert.ok(travelled < 46 * dt * 3 + .5, `${context}: teleported ${travelled} m in one step`);
        before = pose;
        if (!kart.loopId) break;
      }
    }
  });

  test(`${track.id}: even a perpendicular turbo impact stays on the inverted magnetic road`, () => {
    for (const fraction of [.25, .5, .75]) for (const side of [-1, 1]) {
      const kart = onLoop(track, fraction, side * (track.width / 2 + TRACK_SHOULDER - .02));
      Object.assign(kart, { angle: kart.angle + side * Math.PI / 2, speed: 46, boost: 2, lateralVelocity: side * 7 });
      for (let tick = 0; tick < 12; tick++) {
        stepKart(kart, { ...neutralInput(tick), throttle: 1, steer: side, drift: true }, .1);
        assertContained(kart, track, `fraction ${fraction}, side ${side}, tick ${tick}`);
      }
    }
  });

  test(`${track.id}: reversing near either rail preserves contact and reset does not award progress`, () => {
    for (const side of [-1, 1]) {
      const kart = onLoop(track, .5, side * (track.width / 2 + TRACK_SHOULDER - .05));
      kart.speed = -9;
      const nextCheckpoint = kart.nextCheckpoint, lap = kart.lap, creditedProgress = kart.progress;
      for (let tick = 0; tick < 90; tick++) {
        stepKart(kart, { ...neutralInput(tick), throttle: -1, steer: side }, 1 / 30);
        assertContained(kart, track, `reverse side ${side}, tick ${tick}`);
      }
      resetKart(kart);
      assert.equal(kart.lap, lap); assert.equal(kart.nextCheckpoint, nextCheckpoint);
      assert.equal(kart.progress, creditedProgress, 'reset must not turn the looping into a shortcut');
      assert.equal(kart.loopId, ''); assert.equal(kart.airborne, false);
      assert.ok(Math.hypot(kart.x - kart.respawnX, kart.z - kart.respawnZ) < .001);
    }
  });

  test(`${track.id}: side-by-side racing contact cannot shove a kart through the looping rail`, () => {
    for (const side of [-1, 1]) {
      const limit = track.width / 2 + TRACK_SHOULDER;
      const outer = onLoop(track, .5, side * (limit - .05), 'outer');
      const inner = onLoop(track, .5, side * (limit - .25), 'inner');
      outer.speed = inner.speed = 0;
      const world = createWorld(false, track.id);
      world.phase = 'racing'; world.players = [outer, inner]; world.pickups = [];
      for (let tick = 0; tick < 18; tick++) {
        stepWorld(world, new Map(), 1 / 30);
        for (const kart of world.players) {
          assertContained(kart, track, `contact side ${side}, tick ${tick}, ${kart.id}`);
          assert.equal(kart.lap, 0, 'sideways rail correction cannot award a lap');
          assert.equal(kart.finished, false);
        }
      }
      const a = kartLoopPose(outer), b = kartLoopPose(inner);
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 2.45, 'overlapping traffic still separates');
    }
  });
}
