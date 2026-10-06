import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, createKart, createWorld, getTrack, neutralInput, startRace, stepKart, stepWorld, trackPoint, type Kart } from '../shared/game.js';
import { DEFAULT_BUILD, GARAGE_SLOTS, normalizeBuild, type KartBuild } from '../shared/garage.js';
import { KART_MODELS } from '../shared/kart-catalog.js';
import { CHARACTERS } from '../shared/characters.js';

const dt = 1 / 30;
const build = (parts: Partial<KartBuild>): KartBuild => ({ ...DEFAULT_BUILD, ...parts });
function driver(parts: Partial<KartBuild> = {}, trackId = 'dunes') {
  const kart = createKart('test', 'Pilote', COLORS[0]!, 0, trackId, 'zsky', build(parts));
  Object.assign(kart, trackPoint(8, trackId));
  // The same already-used pads in every fixture isolate mechanical effects from
  // a new environmental turbo while retaining the actual movement simulation.
  kart.padLaps = Object.fromEntries(getTrack(trackId).zones.map(zone => [zone.id, 0]));
  return kart;
}
function drive(kart: Kart, ticks: number, options: Partial<ReturnType<typeof neutralInput>> = {}) {
  for (let tick = 0; tick < ticks; tick++) stepKart(kart, { ...neutralInput(tick), throttle: 1, ...options }, dt);
}

test('locked, unknown and wrong-slot parts fall back without trusting injected statistics', () => {
  const forged = { chassis: 'heavy', engine: 'velocity', tires: 'allterrain', turbo: 'burst', wing: 'streamlined', weight: 'ballast',
    speed: 9999, unlockLevel: 3, modifiers: { acceleration: 999 } };
  const original = structuredClone(forged);
  assert.deepEqual(normalizeBuild(forged, 0), DEFAULT_BUILD);
  assert.deepEqual(normalizeBuild(forged, 1), build({ tires: 'allterrain' }));
  assert.deepEqual(normalizeBuild(forged, 2), build({ chassis: 'heavy', engine: 'velocity', tires: 'allterrain' }));
  assert.deepEqual(Object.keys(normalizeBuild(forged, 3)).sort(), [...GARAGE_SLOTS].sort());
  assert.deepEqual(forged, original);
  for (const value of [null, false, 17, 'velocity', ['heavy'], { engine: 'heavy', tires: '__proto__', weight: { id: 'ballast' } }])
    assert.deepEqual(normalizeBuild(value, 3), DEFAULT_BUILD);
  const normalized = normalizeBuild(forged, 0); normalized.engine = 'velocity';
  assert.equal(DEFAULT_BUILD.engine, 'standard', 'normalization must not leak changes into the default kart');
});

test('sprint accelerates faster but the velocity engine achieves a higher sustained road speed', () => {
  const sprint = driver({ engine: 'sprint' }), velocity = driver({ engine: 'velocity' });
  drive(sprint, 15); drive(velocity, 15);
  assert.ok(sprint.speed > velocity.speed + 2, 'the launch difference must exist in movement, not only displayed stats');
  drive(sprint, 45); drive(velocity, 45);
  assert.ok(velocity.speed > sprint.speed + 3, 'the speed tradeoff must appear after accelerating');
  assert.notEqual(sprint.surface, 'offroad'); assert.notEqual(velocity.surface, 'offroad');
  assert.equal(sprint.boost, 0); assert.equal(velocity.boost, 0);
});

test('all-terrain tires retain more speed both offroad and in a real mud zone', () => {
  const road = driver(), allterrain = driver({ tires: 'allterrain' });
  const base = trackPoint(8, 'dunes'), offset = getTrack('dunes').width / 2 + 3;
  for (const kart of [road, allterrain]) Object.assign(kart, { x: base.x + Math.cos(base.angle) * offset,
    z: base.z - Math.sin(base.angle) * offset, speed: 24 });
  drive(road, 20); drive(allterrain, 20);
  assert.equal(road.surface, 'offroad'); assert.equal(allterrain.surface, 'offroad');
  assert.ok(allterrain.speed > road.speed + 3);
  const track = getTrack('canyon'), mud = track.zones.find(zone => zone.kind === 'mud')!;
  const point = trackPoint((mud.start + mud.end) / 2, track.id);
  const muddy = [driver({}, track.id), driver({ tires: 'allterrain' }, track.id)];
  for (const kart of muddy) { Object.assign(kart, point, { x: point.x + Math.cos(point.angle) * mud.offset,
    z: point.z - Math.sin(point.angle) * mud.offset, speed: 30 }); drive(kart, 12); }
  assert.ok(muddy.every(kart => kart.surface === 'mud'));
  assert.ok(muddy[1]!.speed > muddy[0]!.speed + 3);
});

test('snow tires recover sideways sliding and residual rotation faster on actual ice', () => {
  const track = getTrack('glacier'), ice = track.zones.find(zone => zone.kind === 'ice')!;
  const road = driver({}, track.id), snow = driver({ tires: 'snow' }, track.id);
  for (const kart of [road, snow]) {
    Object.assign(kart, trackPoint((ice.start + ice.end) / 2, track.id), { speed: 20, lateralVelocity: 5, turnVelocity: .8 });
    drive(kart, 10, { throttle: 0 });
    assert.equal(kart.surface, 'ice');
  }
  assert.ok(Math.abs(snow.lateralVelocity) < Math.abs(road.lateralVelocity));
  assert.ok(Math.abs(snow.turnVelocity) < Math.abs(road.turnVelocity));
});

test('downforce improves steering response and reduces drift sliding at equal initial speed', () => {
  const neutral = driver(), wing = driver({ wing: 'downforce' });
  const initialAngle = neutral.angle;
  for (const kart of [neutral, wing]) { kart.speed = 24; drive(kart, 9, { throttle: 0, steer: .5, drift: true }); }
  const yaw = (kart: Kart) => Math.abs(Math.atan2(Math.sin(kart.angle - initialAngle), Math.cos(kart.angle - initialAngle)));
  assert.ok(yaw(wing) > yaw(neutral));
  assert.ok(Math.abs(wing.lateralVelocity) < Math.abs(neutral.lateralVelocity));
});

test('endurance turbo extends a released mini-turbo and a burst turbo shortens it', () => {
  const regular = driver(), endurance = driver({ turbo: 'endurance' }), burst = driver({ turbo: 'burst' });
  for (const kart of [regular, endurance, burst]) {
    kart.speed = 24; kart.driftCharge = 1; kart.driftDirection = 1;
    stepKart(kart, neutralInput(), dt);
    assert.equal(kart.driftCharge, 0); assert.ok(kart.boost > 0);
  }
  assert.ok(endurance.boost > regular.boost); assert.ok(regular.boost > burst.boost);
  drive(regular, 29, { throttle: 0 }); drive(endurance, 29, { throttle: 0 });
  assert.equal(regular.boost, 0); assert.ok(endurance.boost > .1);
});

test('light construction launches faster and heavy ballast resists more displacement in actual collisions', () => {
  const light = driver({ chassis: 'light', weight: 'feather' }), heavy = driver({ chassis: 'heavy', weight: 'ballast' });
  drive(light, 15); drive(heavy, 15); assert.ok(light.speed > heavy.speed + 3);
  const world = createWorld(false, 'dunes'); world.phase = 'racing'; world.pickups = [];
  const point = trackPoint(8, 'dunes');
  const a = createKart('light', 'Plume', COLORS[0]!, 0, 'dunes', 'zsky', light.build);
  const b = createKart('heavy', 'Lest', COLORS[1]!, 1, 'dunes', 'zsky', heavy.build);
  Object.assign(a, point); Object.assign(b, point, { x: point.x + 1 });
  const beforeA = { x: a.x, z: a.z }, beforeB = { x: b.x, z: b.z }; world.players = [a, b];
  stepWorld(world, new Map(), dt);
  assert.ok(Math.hypot(a.x - beforeA.x, a.z - beforeA.z) > Math.hypot(b.x - beforeB.x, b.z - beforeB.z) * 1.4);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2.49);
});

test('every model and character combination produces identical physics with the same build and input stream', () => {
  let reference: Omit<Kart, 'modelId' | 'characterId'> | undefined;
  for (const model of KART_MODELS) for (const character of CHARACTERS) {
    const kart = createKart('cosmetic', 'Même pilote', COLORS[0]!, 0, 'lagon', model.id,
      build({ chassis: 'light', tires: 'allterrain', wing: 'downforce' }), character.id);
    for (let tick = 0; tick < 120; tick++) stepKart(kart, { ...neutralInput(tick), throttle: 1,
      steer: tick < 40 ? .2 : tick < 85 ? -.4 : .5, drift: tick >= 40 && tick < 85 }, dt);
    const { modelId, characterId, ...physics } = kart;
    assert.equal(modelId, model.id); assert.equal(characterId, character.id);
    if (reference) assert.deepEqual(physics, reference, model.id + '/' + character.id); else reference = physics;
  }
});

test('a new race preserves build, visual choices, team and career identity while resetting motion', () => {
  const world = createWorld(false, 'dunes');
  const kart = createKart('saved', 'Pilote', COLORS[0]!, 0, 'lagon', 'retro', build({ chassis: 'heavy', engine: 'velocity' }), 'queen');
  Object.assign(kart, { playerId: 'persistent-id', careerLevel: 3, team: 1, cpu: true, speed: 35, boost: 2 }); world.players = [kart];
  startRace(world);
  assert.deepEqual(kart.build, build({ chassis: 'heavy', engine: 'velocity' }));
  assert.equal(kart.modelId, 'retro'); assert.equal(kart.characterId, 'queen'); assert.equal(kart.playerId, 'persistent-id');
  assert.equal(kart.careerLevel, 3); assert.equal(kart.team, 1); assert.equal(kart.cpu, true);
  assert.equal(kart.trackId, 'dunes'); assert.equal(kart.speed, 0); assert.equal(kart.boost, 0);
});
