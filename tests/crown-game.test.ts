import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, createKart, neutralInput, startRace, stepWorld, standings, type Kart, type World } from '../shared/game.js';
import { createCrownState, CROWN_SECONDS } from '../shared/crown.js';
import { getCpuInput } from '../shared/cpu.js';
import { getTrack, getTrackLapCount, trackPoint } from '../shared/track.js';

const dt = 1 / 30;
function place(kart: Kart, progress: number, speed = 0) {
  const track = getTrack(kart.trackId), local = (progress % track.length + track.length) % track.length;
  Object.assign(kart, trackPoint(local, track.id), { progress, speed, lap: Math.floor(progress / track.length),
    nextCheckpoint: (Math.floor(local / (track.length / track.checkpoints.length)) + 1) % track.checkpoints.length });
}
function race(count = 2): World {
  const world = createWorld(false); world.crown = createCrownState();
  world.players = Array.from({ length: count }, (_, index) => createKart(`p${index}`, `Couronne ${index}`, '#ffcc44', index));
  startRace(world); world.phase = 'racing'; world.pickups = [];
  world.players.forEach((kart, index) => place(kart, 40 + index * 45));
  return world;
}
function hit(world: World, victim: Kart, owner: Kart) {
  world.objects = [{ id: `trap-${world.time}`, kind: 'trap', x: victim.x, z: victim.z, owner: owner.id, angle: 0, ttl: 18 }];
  stepWorld(world, new Map(), dt);
}
function expireInitialProtection(world: World) { for (let tick = 0; tick < 91; tick++) stepWorld(world, new Map(), dt); }

test('crown: only a real effective object impact transfers, and protection prevents instant retaliation', () => {
  const world = race(), holder = world.players.find(kart => kart.id === world.crown!.holderId)!, attacker = world.players.find(kart => kart !== holder)!;
  hit(world, holder, attacker);
  assert.equal(world.crown!.holderId, holder.id); assert.equal(holder.stun, 0); assert.equal(world.crown!.transfers, 0);
  expireInitialProtection(world); hit(world, holder, attacker);
  assert.ok(holder.stun > 0); assert.equal(world.crown!.holderId, attacker.id); assert.equal(world.crown!.transfers, 1);
  assert.deepEqual(world.crown!.lastTransfer, { seq: 1, at: world.raceTime, fromId: holder.id, toId: attacker.id });
  hit(world, attacker, holder);
  assert.equal(attacker.stun, 0); assert.equal(world.crown!.holderId, attacker.id); assert.equal(world.crown!.transfers, 1);
});

test('crown: shields, stars and hit grace consume no ownership; a later unprotected hit does', () => {
  for (const protection of ['shield', 'invincible', 'hitGrace'] as const) {
    const world = race(), holder = world.players.find(kart => kart.id === world.crown!.holderId)!, attacker = world.players.find(kart => kart !== holder)!;
    expireInitialProtection(world); holder[protection] = 1; hit(world, holder, attacker);
    assert.equal(holder.stun, 0, protection); assert.equal(world.crown!.holderId, holder.id, protection);
    assert.equal(world.crown!.transfers, 0, protection);
    for (let tick = 0; tick < 32; tick++) stepWorld(world, new Map(), dt);
    hit(world, holder, attacker); assert.equal(world.crown!.holderId, attacker.id, protection);
  }
});

test('crown: a normal bump never steals but an effective star contact does', () => {
  const world = race(), holder = world.players.find(kart => kart.id === world.crown!.holderId)!, attacker = world.players.find(kart => kart !== holder)!;
  expireInitialProtection(world); Object.assign(attacker, { x: holder.x + .4, z: holder.z, speed: 0 });
  stepWorld(world, new Map(), dt); assert.equal(world.crown!.holderId, holder.id); assert.equal(holder.stun, 0);
  Object.assign(attacker, { x: holder.x + .4, z: holder.z, speed: 0, invincible: 2 });
  stepWorld(world, new Map(), dt); assert.equal(world.crown!.holderId, attacker.id); assert.ok(holder.stun > 0);
});

test('crown: valid forward travel scores, waiting, reverse, replayed metres and reset do not', () => {
  const world = race(1), kart = world.players[0]!; place(kart, 40, 20);
  for (let tick = 0; tick < 60; tick++) stepWorld(world, new Map([[kart.id, getCpuInput(kart, tick, world)]]), dt);
  assert.ok(world.crown!.scores[kart.id]! > 5);
  for (let tick = 0; tick < 40; tick++) stepWorld(world, new Map([[kart.id, { ...neutralInput(), brake: true }]]), dt);
  const stoppedScore = world.crown!.scores[kart.id], stoppedMeters = world.crown!.meters[kart.id]!;
  for (let tick = 0; tick < 45; tick++) stepWorld(world, new Map(), dt);
  assert.equal(world.crown!.scores[kart.id], stoppedScore); assert.equal(world.crown!.meters[kart.id], stoppedMeters);
  for (let tick = 0; tick < 40; tick++) stepWorld(world, new Map([[kart.id, { ...neutralInput(), throttle: -1 }]]), dt);
  assert.ok(kart.speed < 0); assert.equal(world.crown!.meters[kart.id], stoppedMeters);
  let retracedForward = false;
  for (let tick = 0; tick < 120 && kart.progress < world.crown!.creditedProgress[kart.id]! - 2; tick++) {
    stepWorld(world, new Map([[kart.id, { ...neutralInput(), throttle: 1 }]]), dt);
    retracedForward ||= kart.speed > 2;
    assert.equal(world.crown!.meters[kart.id], stoppedMeters, 'previously scored metres stay paid exactly once');
  }
  assert.ok(retracedForward, 'the kart really drives forward through the previously scored section');
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), reset: true }]]), dt);
  assert.equal(world.crown!.meters[kart.id], stoppedMeters, 'respawn cannot award metres');
});

test('crown: ordinary CPU driving may exceed the normal lap count but the match ends at 90 seconds', () => {
  const world = race(1), kart = world.players[0]!; let exceeded = false;
  for (let tick = 0; tick < 2700 && world.phase === 'racing'; tick++) {
    stepWorld(world, new Map([[kart.id, getCpuInput(kart, tick, world)]]), dt);
    if (kart.lap >= getTrackLapCount(world.trackId) && world.raceTime < CROWN_SECONDS - dt) {
      exceeded = true; assert.equal(kart.finished, false); assert.equal(world.phase, 'racing');
    }
  }
  assert.ok(exceeded, 'no fixture teleports: normal controls actually pass the usual finish lap');
  assert.equal(world.phase, 'finished'); assert.equal(world.crown!.remaining, 0); assert.equal(kart.finished, true);
  assert.ok(Math.abs(world.raceTime - CROWN_SECONDS) < dt); assert.ok(world.crown!.scores[kart.id]! > 0);
});

test('crown: standings prioritize scores and a disconnected holder is replaced without an attack reward', () => {
  const world = race(); const holder = world.players.find(kart => kart.id === world.crown!.holderId)!, other = world.players.find(kart => kart !== holder)!;
  world.crown!.scores[holder.id] = 5; world.crown!.scores[other.id] = 1;
  assert.equal(standings(world)[0]!.id, holder.id);
  holder.connected = false; stepWorld(world, new Map(), dt);
  assert.equal(world.crown!.holderId, other.id); assert.equal(world.crown!.transfers, 0);
  assert.ok(world.crown!.protectedUntil > world.raceTime);
});

test('crown: a disconnected top scorer cannot take the final winner rank from the active finisher', () => {
  const world = race(), disconnected = world.players[0]!, active = world.players[1]!;
  world.crown!.scores[disconnected.id] = 99; world.crown!.scores[active.id] = 2;
  disconnected.connected = false;
  for (let tick = 0; tick < 2700 && world.phase === 'racing'; tick++) stepWorld(world, new Map(), dt);
  assert.equal(world.phase, 'finished'); assert.equal(active.finished, true); assert.equal(disconnected.finished, false);
  assert.equal(active.rank, 1); assert.equal(standings(world)[0]!.id, active.id);
});
