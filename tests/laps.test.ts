import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, TOTAL_LAPS, TRACKS, createKart, createWorld, getTrack, neutralInput,
  stepWorld, type World } from '../shared/game.js';

function race(trackId = 'lagon', eventLevel = 0): World {
  const world = createWorld(true, trackId); world.phase = 'racing'; world.pickups = []; world.eventLevel = eventLevel;
  world.players = [createKart('driver', 'Pilote', COLORS[0]!, 0, trackId)];
  world.players[0]!.eventLevel = eventLevel; return world;
}
type Gate = { x: number; z: number; angle: number; width?: number; branchId?: string };
function cross(world: World, gate: Gate, offset = 0, reverse = false, dt = 1 / 30, distance = 0.15) {
  const kart = world.players[0]!, sign = reverse ? -1 : 1;
  kart.x = gate.x + Math.cos(gate.angle) * offset - Math.sin(gate.angle) * distance * sign;
  kart.z = gate.z - Math.sin(gate.angle) * offset - Math.cos(gate.angle) * distance * sign;
  kart.angle = gate.angle + (reverse ? Math.PI : 0); kart.speed = 18;
  kart.turnVelocity = 0; kart.lateralVelocity = 0; kart.resetLatch = false;
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), throttle: 1 }]]), dt);
}

for (const track of TRACKS) test(`${track.id}: a legal shoulder trajectory counts three full laps without missing a gate`, () => {
  const world = race(track.id), kart = world.players[0]!;
  for (let lap = 0; lap < TOTAL_LAPS; lap++) {
    for (let gate = 1; gate < track.checkpoints.length; gate++) {
      cross(world, track.checkpoints[gate]!, track.width / 2 + 3);
      assert.equal(kart.nextCheckpoint, (gate + 1) % track.checkpoints.length, `lap ${lap}, gate ${gate}: the physical shoulder remains driveable`);
    }
    cross(world, track.checkpoints[0]!, -(track.width / 2 + 3));
    assert.equal(kart.lap, lap + 1, 'finish line also covers the physical shoulder');
  }
  assert.equal(kart.finished, true); assert.equal(world.phase, 'finished');
});

test('starting exactly on an uncredited checkpoint plane then moving forward credits it once', () => {
  const world = race(), kart = world.players[0]!, gate = getTrack('lagon').checkpoints[1]!;
  cross(world, gate, 0, false, 1 / 30, 0);
  assert.equal(kart.nextCheckpoint, 2);
  cross(world, gate, 0, false, 1 / 30, 0);
  assert.equal(kart.nextCheckpoint, 2);
});

test('stationary, reverse, out-of-order and far outside crossings never manufacture a checkpoint or lap', () => {
  const world = race(), kart = world.players[0]!, track = getTrack('lagon');
  Object.assign(kart, track.checkpoints[1]!, { speed: 0 });
  stepWorld(world, new Map(), 1 / 30); assert.equal(kart.nextCheckpoint, 1);
  cross(world, track.checkpoints[1]!, 0, true); assert.equal(kart.nextCheckpoint, 1);
  cross(world, track.checkpoints[4]!); assert.equal(kart.nextCheckpoint, 1);
  cross(world, track.checkpoints[1]!, track.width / 2 + 50); assert.equal(kart.nextCheckpoint, 1);
  cross(world, track.checkpoints[0]!); assert.equal(kart.lap, 0);
});

test('reset returns to the last validated checkpoint without treating its teleport as a crossing', () => {
  const world = race(), kart = world.players[0]!, track = getTrack('lagon');
  cross(world, track.checkpoints[1]!); assert.equal(kart.nextCheckpoint, 2);
  const respawn = { x: kart.respawnX, z: kart.respawnZ };
  Object.assign(kart, track.checkpoints[4]!, { speed: 0 });
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), reset: true }]]), 1 / 30);
  assert.equal(kart.nextCheckpoint, 2); assert.equal(kart.lap, 0);
  assert.equal(kart.x, respawn.x); assert.equal(kart.z, respawn.z);
});

test('100 ms movement sweeps through the expected gate and finish-line jitter cannot replay a lap', () => {
  const world = race(), kart = world.players[0]!, track = getTrack('lagon');
  for (let gate = 1; gate < track.checkpoints.length; gate++) cross(world, track.checkpoints[gate]!, 0, false, 0.1);
  cross(world, track.checkpoints[0]!, 0, false, 0.1); assert.equal(kart.lap, 1);
  for (let i = 0; i < 5; i++) { cross(world, track.checkpoints[0]!, 0, true); cross(world, track.checkpoints[0]!); }
  assert.equal(kart.lap, 1); assert.equal(kart.nextCheckpoint, 1);
});
