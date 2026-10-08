import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_TRACK_TEMPLATES, registerCustomTrack } from '../shared/custom-tracks.js';
import { createKart, createWorld, PROJECTILE_TTL, stepWorld, type World, type WorldObject } from '../shared/game.js';
import { trackBoundaryShoulder } from '../shared/obstacle-heights.js';
import { getTrackEvent, nearestDriveableTrack } from '../shared/track-events.js';
import { getTrack, trackElevation, trackPoint } from '../shared/track.js';

const dt = 1 / 30;

function race(trackId = 'lagon'): World {
  const world = createWorld(false, trackId);
  world.phase = 'racing';
  world.pickups = [];
  world.players = [createKart('owner', 'Owner', '#fc735d', 0, trackId)];
  return world;
}

function shell(x: number, z: number, angle: number, progress: number, elevation = 0): WorldObject {
  return { id: 'bouncing-shell', kind: 'projectile', owner: 'owner', x, z, angle,
    progress, elevation, ttl: PROJECTILE_TTL };
}

test('a projectile approaching an active roadblock front reflects away and remains outside it', () => {
  const world = race();
  world.eventStage = 1; world.eventLevel = 2;
  const blocker = getTrackEvent(world.trackId, world.eventStage, world.eventLevel).blockers[0]!;
  assert.ok(blocker, 'the selected race phase really has a roadblock');
  const sine = Math.sin(blocker.angle), cosine = Math.cos(blocker.angle);
  const offset = blocker.halfLength + .95 + 1;
  const x = blocker.x - sine * offset, z = blocker.z - cosine * offset;
  const progress = nearestDriveableTrack(x, z, world.trackId, 1, 2).progress;
  world.objects = [shell(x, z, blocker.angle, progress, blocker.elevation)];

  stepWorld(world, new Map(), dt);

  assert.equal(world.objects.length, 1, 'a roadblock reflects instead of destroying the shell');
  const projectile = world.objects[0]!;
  assert.ok(Math.cos(projectile.angle - blocker.angle) < -.99, 'the longitudinal heading reverses');
  const along = (projectile.x - blocker.x) * sine + (projectile.z - blocker.z) * cosine;
  assert.ok(along < -blocker.halfLength - .95, 'the projectile stays on the incoming side');
  assert.ok(Math.abs(projectile.ttl - (PROJECTILE_TTL - dt)) < 1e-8);
});

test('a projectile hitting a roadblock side reflects back into the open detour', () => {
  const world = race('neon');
  world.eventStage = 1; world.eventLevel = 2;
  const blocker = getTrackEvent(world.trackId, world.eventStage, world.eventLevel).blockers[0]!;
  assert.ok(blocker);
  const nx = Math.cos(blocker.angle), nz = -Math.sin(blocker.angle);
  const offset = blocker.halfWidth + .95 + 1;
  const x = blocker.x + nx * offset, z = blocker.z + nz * offset;
  const road = nearestDriveableTrack(x, z, world.trackId, 1, 2);
  assert.ok(road.branchId, 'the lateral approach starts on the open detour');
  assert.ok(road.distance < road.width / 2 + trackBoundaryShoulder(road.progress, world.trackId, road.branchId));
  world.objects = [shell(x, z, blocker.angle - Math.PI / 2, road.progress, blocker.elevation)];

  stepWorld(world, new Map(), dt);

  assert.equal(world.objects.length, 1);
  const projectile = world.objects[0]!;
  assert.ok(Math.sin(projectile.angle) * nx + Math.cos(projectile.angle) * nz > .99,
    'the lateral heading reverses towards the detour');
  const across = (projectile.x - blocker.x) * nx + (projectile.z - blocker.z) * nz;
  assert.ok(across > blocker.halfWidth + .95, 'the shell does not enter the obstacle');
  assert.ok(Math.abs(projectile.ttl - (PROJECTILE_TTL - dt)) < 1e-8);
});

test('wall rebounds preserve both the lower and upper route of a stacked custom crossing', () => {
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES.find(template => template.id === 'figure-eight')!.draft);
  draft.zones = [];
  const track = registerCustomTrack({ id: 'custom-projectile-bounces', revision: 1, draft,
    createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z' });
  const crossing = track.crossings![0]!;
  assert.ok(crossing);

  for (const progress of [crossing.lowerProgress, crossing.upperProgress]) {
    const world = race(track.id), point = trackPoint(progress, track.id);
    const elevation = trackElevation(progress, track.id);
    const boundary = track.width / 2 + trackBoundaryShoulder(progress, track.id);
    const nx = Math.cos(point.angle), nz = -Math.sin(point.angle);
    world.objects = [shell(point.x + nx * (boundary - 1), point.z + nz * (boundary - 1),
      point.angle + Math.PI / 2, progress, elevation)];

    stepWorld(world, new Map(), dt);

    assert.equal(world.objects.length, 1);
    const projectile = world.objects[0]!;
    assert.ok(Math.sin(projectile.angle) * nx + Math.cos(projectile.angle) * nz < -.9, 'the wall really reflects the shell');
    for (let tick = 0; tick < 8; tick++) {
      assert.ok(Math.abs(projectile.progress! - progress) < 3, 'the surface coordinate never switches to the crossing route');
      assert.ok(Math.abs(projectile.elevation! - elevation) < .01, 'the projectile retains its floor height');
      const road = nearestDriveableTrack(projectile.x, projectile.z, track.id, 0, 0, projectile);
      assert.ok(road.distance <= boundary + .01, 'the shell remains inside its own rail');
      stepWorld(world, new Map(), dt);
      assert.equal(world.objects.length, 1);
    }
  }
});

test('a shell stuns a victim behind its launch point only after an observed wall rebound', () => {
  const world = race(), track = getTrack(world.trackId), point = trackPoint(60, track.id);
  const nx = Math.cos(point.angle), nz = -Math.sin(point.angle);
  const victim = createKart('victim', 'Victim', '#69cbd0', 1, track.id);
  Object.assign(victim, { ...point, x: point.x - nx * 4, z: point.z - nz * 4,
    progress: 60, routeProgress: 60, speed: 0, elevation: trackElevation(60, track.id) });
  world.players.push(victim);
  world.objects = [shell(point.x + nx * 6, point.z + nz * 6, point.angle + Math.PI / 2, 60)];
  let bounced = false, hit = false;

  for (let tick = 0; tick < 60 && world.objects.length; tick++) {
    stepWorld(world, new Map(), dt);
    const projectile = world.objects[0];
    if (projectile && Math.sin(projectile.angle) * nx + Math.cos(projectile.angle) * nz < -.9) bounced = true;
    if (victim.stun > 0) {
      assert.ok(bounced, 'the impact must follow a separately observed reflected heading');
      hit = true;
      break;
    }
    if (!bounced) assert.equal(victim.stun, 0, 'the outgoing segment cannot reach the victim behind it');
  }

  assert.ok(bounced, 'the shell reached the wall and reflected');
  assert.ok(hit, 'the reflected segment hit the victim');
  assert.equal(world.objects.length, 0, 'the shell is consumed by that hit');
});
