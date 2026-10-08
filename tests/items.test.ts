import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, ITEMS, MAX_WORLD_OBJECTS, PROJECTILE_TTL, SHIELD_SECONDS, STAR_SECONDS, createKart, createWorld,
  getTrack, neutralInput, startRace, stepKart, stepWorld, trackPoint, validateInput,
  type Item, type Kart, type World, type WorldObject } from '../shared/game.js';

const dt = 1 / 30;
function place(kart: Kart, progress: number) {
  const track = getTrack(kart.trackId);
  const local = ((progress % track.length) + track.length) % track.length;
  Object.assign(kart, trackPoint(local, track.id), { progress, lap: Math.floor(progress / track.length), speed: 0,
    nextCheckpoint: (Math.floor(local / (track.length / track.checkpoints.length)) + 1) % track.checkpoints.length });
}
function race(count = 3): World {
  const world = createWorld(count === 1); world.phase = 'racing'; world.pickups = [];
  world.players = Array.from({ length: count }, (_, i) => createKart(`p${i}`, `Pilote ${i}`, COLORS[i]!, i));
  world.players.forEach((kart, i) => place(kart, 40 + i * 40));
  return world;
}
function use(world: World, item: Item, index = 0) {
  const kart = world.players[index]!; kart.item = item; kart.itemCharges = item === 'tripleTurbo' ? 3 : 1; kart.itemLatch = false;
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), use: true }]]), dt);
}
function trap(victim: Kart, owner = 'external', id = 'hazard'): WorldObject {
  return { id, kind: 'trap', x: victim.x, z: victim.z, angle: 0, owner, ttl: 18 };
}

test('triple turbo needs three separate presses, retains inventory and never stacks unlimited duration', () => {
  const world = race(1), kart = world.players[0]!;
  use(world, 'tripleTurbo');
  assert.equal(kart.item, 'tripleTurbo'); assert.equal(kart.itemCharges, 2); assert.equal(kart.boost, 1.65);
  for (let i = 0; i < 3; i++) stepWorld(world, new Map([[kart.id, { ...neutralInput(), use: true }]]), dt);
  assert.equal(kart.itemCharges, 2);
  stepWorld(world, new Map(), dt);
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), use: true }]]), dt);
  assert.equal(kart.itemCharges, 1); assert.equal(kart.boost, 1.65);
  stepWorld(world, new Map(), dt);
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), use: true }]]), dt);
  assert.equal(kart.itemCharges, 0); assert.equal(kart.item, ''); assert.equal(kart.boost, 1.65);
});

test('red seeks the next validated opponent; blue seeks the leader across laps and ignores stale ranks', () => {
  for (const kind of ['seeker', 'leaderBolt'] as const) {
    const world = race(7), owner = world.players[0]!;
    world.players[1]!.rank = 99;
    place(world.players[2]!, getTrack('lagon').length + 25); world.players[2]!.rank = 8;
    world.players[3]!.finished = true;
    world.players[4]!.spectator = true;
    world.players[5]!.connected = false;
    world.players[6]!.abandoned = true;
    use(world, kind);
    assert.equal(world.objects.length, 1);
    assert.equal(world.objects[0]!.targetId, world.players[kind === 'seeker' ? 1 : 2]!.id);
    assert.equal(owner.stun, 0);
  }
});

test('leader comet retargets a new leader; red expires on target disconnect and blue skips finished racers', () => {
  const world = race();
  use(world, 'leaderBolt'); assert.equal(world.objects[0]!.targetId, 'p2');
  place(world.players[1]!, 160);
  stepWorld(world, new Map(), dt); assert.equal(world.objects[0]!.targetId, 'p1');
  world.players[1]!.finished = true;
  stepWorld(world, new Map(), dt); assert.equal(world.objects[0]!.targetId, 'p2');
  world.players[2]!.connected = false;
  stepWorld(world, new Map(), dt); assert.equal(world.objects.length, 0);
  const red = race(); use(red, 'seeker'); red.players[1]!.connected = false;
  stepWorld(red, new Map(), dt); assert.equal(red.objects.length, 0);
});

test('guided objects follow a winding circuit and eventually hit; blue passes through non-target racers', () => {
  for (const kind of ['seeker', 'leaderBolt'] as const) {
    const world = race(), target = world.players[kind === 'seeker' ? 1 : 2]!;
    place(target, 230); if (kind === 'seeker') place(world.players[2]!, 260);
    use(world, kind);
    let hit = false;
    for (let tick = 0; tick < 30 * 8 && world.objects.length; tick++) {
      stepWorld(world, new Map(), dt); hit ||= target.stun > 0;
      if (kind === 'leaderBolt') assert.equal(world.players[1]!.stun, 0);
    }
    assert.ok(hit, `${kind} should reach the target around bends`);
    assert.equal(world.objects.length, 0);
  }
});

test('a stored homing item becomes a short turbo when no eligible opponent remains', () => {
  for (const kind of ['seeker', 'leaderBolt'] as const) {
    const world = race(1); use(world, kind);
    assert.equal(world.objects.length, 0); assert.equal(world.players[0]!.item, '');
    assert.equal(world.players[0]!.boost, 1.2);
  }
});

test('star clears stun and protects from every object while shield absorbs exactly one separated impact', () => {
  for (const kind of ['trap', 'projectile', 'seeker', 'leaderBolt'] as const) {
    const world = race(), victim = world.players[0]!;
    victim.stun = 1; use(world, 'star');
    assert.equal(victim.invincible, STAR_SECONDS); assert.equal(victim.stun, 0);
    const object = trap(victim, 'p1'); object.kind = kind; object.targetId = victim.id;
    // The blue comet selects the highest-progress active opponent of its owner.
    if (kind === 'leaderBolt') { place(victim, 150); object.x = victim.x; object.z = victim.z; }
    world.objects = [object]; stepWorld(world, new Map(), dt);
    assert.equal(victim.stun, 0, kind); assert.equal(world.objects.length, 0, kind);
  }
  const world = race(), victim = world.players[0]!; use(world, 'shield');
  assert.equal(victim.shield, SHIELD_SECONDS);
  world.objects = [trap(victim)]; stepWorld(world, new Map(), dt);
  assert.equal(victim.shield, 0); assert.equal(victim.stun, 0); assert.ok(victim.hitGrace > 0);
  for (let i = 0; i < 20; i++) stepWorld(world, new Map(), dt);
  world.objects = [trap(victim)]; stepWorld(world, new Map(), dt);
  assert.ok(victim.stun > 0);
});

test('star collision protects its own trajectory and knocks opponents, respecting shields and grace', () => {
  const world = race(), [star, victim] = world.players;
  use(world, 'star');
  place(victim!, 40); Object.assign(victim!, { x: star!.x + 0.5, z: star!.z });
  const predicted = structuredClone(star!); stepKart(predicted, neutralInput(), dt);
  stepWorld(world, new Map(), dt);
  assert.equal(star!.x, predicted.x); assert.equal(star!.z, predicted.z); assert.equal(star!.stun, 0);
  assert.ok(victim!.stun > 0);
  victim!.stun = 0; victim!.hitGrace = 0; victim!.shield = 4;
  Object.assign(victim!, { x: star!.x, z: star!.z }); stepWorld(world, new Map(), dt);
  assert.equal(victim!.shield, 0); assert.equal(victim!.stun, 0);
});

test('prediction decrements protection deterministically and protection really expires', () => {
  const world = race(1), kart = world.players[0]!;
  kart.invincible = 0.08; kart.shield = 0.08; kart.hitGrace = 0.08;
  const predicted = structuredClone(kart);
  for (let i = 0; i < 4; i++) { stepKart(predicted, neutralInput(), dt); stepWorld(world, new Map(), dt); }
  assert.equal(kart.invincible, 0); assert.equal(kart.shield, 0); assert.equal(kart.hitGrace, 0);
  assert.equal(kart.x, predicted.x); assert.equal(kart.z, predicted.z);
  world.objects = [trap(kart)]; stepWorld(world, new Map(), dt); assert.ok(kart.stun > 0);
});

test('fast projectiles hit across the entire 100 ms segment without tunnelling', () => {
  const world = race(), victim = world.players[1]!, point = trackPoint(80);
  world.objects = [{ id: 'fast', kind: 'projectile', x: point.x - Math.sin(point.angle) * 3,
    z: point.z - Math.cos(point.angle) * 3, angle: point.angle, owner: 'p0', ttl: 2 }];
  stepWorld(world, new Map(), 0.1);
  assert.ok(victim.stun > 0); assert.equal(world.objects.length, 0);
});

test('mystery boxes are deterministic, never overwrite held charges, and exclude disconnected racers', () => {
  const a = race(), b = structuredClone(a);
  for (const world of [a, b]) {
    const kart = world.players[0]!; world.pickups = [{ id: 'box', x: kart.x, z: kart.z, cooldown: 0 }];
    stepWorld(world, new Map(), dt);
    assert.ok(ITEMS.includes(kart.item as typeof ITEMS[number]));
    assert.equal(kart.itemCharges, kart.item === 'tripleTurbo' ? 3 : 1);
    const item = kart.item, seed = world.seed;
    world.pickups[0]!.cooldown = 0; stepWorld(world, new Map(), dt);
    assert.equal(kart.item, item); assert.equal(world.seed, seed);
    kart.item = ''; kart.itemCharges = 0; kart.connected = false;
    stepWorld(world, new Map(), dt); assert.equal(kart.item, ''); assert.equal(world.seed, seed);
  }
  assert.equal(a.players[0]!.item, b.players[0]!.item); assert.equal(a.seed, b.seed);
});

test('weighted draws offer all eight tools to trailing racers while leaders never get homing weapons', () => {
  const world = race(), collected = new Set<Item>();
  for (let i = 0; i < 400; i++) {
    const kart = world.players[0]!; kart.item = ''; kart.itemCharges = 0;
    world.pickups = [{ id: 'box', x: kart.x, z: kart.z, cooldown: 0 }];
    stepWorld(world, new Map(), dt); collected.add(kart.item);
  }
  assert.deepEqual([...collected].sort(), [...ITEMS].sort());
  const solo = race(1), kart = solo.players[0]!;
  for (let i = 0; i < 100; i++) {
    kart.item = ''; solo.pickups = [{ id: 'box', x: kart.x, z: kart.z, cooldown: 0 }];
    stepWorld(solo, new Map(), dt); assert.notEqual(kart.item, 'seeker'); assert.notEqual(kart.item, 'leaderBolt');
  }
});

test('object state is bounded, expires, and all new inventory/effects reset for the next race', () => {
  const world = race(), kart = world.players[0]!;
  for (let i = 0; i < MAX_WORLD_OBJECTS; i++) world.objects.push({ ...trap(kart, `owner${i}`, `trap${i}`), x: 0, z: 0 });
  use(world, 'trap'); assert.equal(world.objects.length, MAX_WORLD_OBJECTS);
  for (let i = 0; i < 6; i++) use(world, 'trap');
  assert.equal(world.objects.filter(object => object.owner === kart.id).length, 4);
  for (const object of world.objects) object.ttl = dt / 2;
  stepWorld(world, new Map(), dt); assert.equal(world.objects.length, 0);
  kart.invincible = 5; kart.shield = 6; kart.hitGrace = 1; kart.item = 'tripleTurbo'; kart.itemCharges = 2;
  startRace(world);
  assert.equal(kart.item, ''); assert.equal(kart.itemCharges, 0); assert.equal(kart.invincible, 0);
  assert.equal(kart.shield, 0); assert.equal(kart.hitGrace, 0);
});

test('clients cannot forge items, charges, protections, targets or objects through the input contract', () => {
  for (const forged of [{ item: 'star' }, { itemCharges: 99 }, { invincible: 999 }, { shield: 999 },
    { targetId: 'p1' }, { objects: [trap(createKart('p1', 'Target', COLORS[1]!, 1))] }])
    assert.equal(validateInput({ ...neutralInput(), ...forged }), null);
});

test('projectiles bounce off track boundary walls and reflect their angle', () => {
  const world = race(1);
  const track = getTrack(world.trackId);
  const center = trackPoint(50, track.id);
  const boundary = track.width / 2 + 5;
  const nx = Math.cos(center.angle), nz = -Math.sin(center.angle);
  const projX = center.x + nx * (boundary - 1);
  const projZ = center.z + nz * (boundary - 1);
  const angle = center.angle + Math.PI / 4;
  world.objects = [{ id: 'shell-bounce', kind: 'projectile', x: projX, z: projZ, angle, owner: 'p0', ttl: PROJECTILE_TTL }];
  stepWorld(world, new Map(), dt);
  assert.equal(world.objects.length, 1);
  const shell = world.objects[0]!;
  assert.notEqual(shell.angle, angle);
  const dotBefore = Math.sin(angle) * nx + Math.cos(angle) * nz;
  const dotAfter = Math.sin(shell.angle) * nx + Math.cos(shell.angle) * nz;
  assert.ok(dotBefore > 0, 'was heading outward into the wall');
  assert.ok(dotAfter < 0, 'is now heading inward away from the wall');
});

test('projectiles bounce repeatedly and remain alive for their full 5-second duration', () => {
  const world = race(1);
  const kart = world.players[0]!;
  kart.item = 'projectile';
  kart.itemCharges = 1;
  stepWorld(world, new Map([[kart.id, { ...neutralInput(), use: true }]]), dt);
  assert.equal(world.objects.length, 1);
  assert.equal(world.objects[0]!.kind, 'projectile');
  assert.ok(Math.abs(world.objects[0]!.ttl - (PROJECTILE_TTL - dt)) < 1e-5);
  for (let t = dt; t < 4.5; t += dt) {
    stepWorld(world, new Map(), dt);
    assert.equal(world.objects.length, 1, `shell should still be alive at ${t.toFixed(2)}s`);
  }
  for (let t = 4.5; t <= 5.2; t += dt) {
    stepWorld(world, new Map(), dt);
  }
  assert.equal(world.objects.length, 0, 'shell should expire after 5 seconds');
});

test('a shell aimed at a wall can stun an opponent before reaching it', () => {
  const world = race(2);
  const [owner, victim] = world.players;
  const track = getTrack(world.trackId);
  const center = trackPoint(60, track.id);
  const nx = Math.cos(center.angle), nz = -Math.sin(center.angle);
  const boundary = track.width / 2 + 5;
  Object.assign(owner!, center);
  Object.assign(victim!, { x: center.x + nx * 4, z: center.z + nz * 4 });
  const wallX = center.x + nx * boundary;
  const wallZ = center.z + nz * boundary;
  const aimAngle = Math.atan2(wallX - center.x, wallZ - center.z);
  world.objects = [{ id: 'trickshot', kind: 'projectile', x: center.x, z: center.z, angle: aimAngle, owner: owner!.id, ttl: PROJECTILE_TTL }];
  let hit = false;
  for (let tick = 0; tick < 30 * 2 && world.objects.length; tick++) {
    stepWorld(world, new Map(), dt);
    if (victim!.stun > 0) { hit = true; break; }
  }
  assert.ok(hit, 'victim on the outgoing path should be stunned before the wall');
});
