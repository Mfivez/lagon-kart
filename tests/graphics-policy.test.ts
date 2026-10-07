import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GraphicsPolicy, RenderPacer, graphicsMode } from '../client/graphics-policy.js';
import { reduceSceneryDetails } from '../client/graphics-scenery.js';
import { buildTrackExtras } from '../client/scenery-extras.js';
import { getTrack } from '../shared/track.js';

test('graphics: explicit modes select a real shadow/resolution tier without disabling Auto adaptation', () => {
  const policy = new GraphicsPolicy();
  assert.equal(policy.mode, 'auto'); assert.equal(policy.quality, 'standard'); assert.equal(policy.pixelRatio(3), 1.6);
  policy.setMode('smooth'); assert.equal(policy.quality, 'light'); assert.equal(policy.pixelRatio(3), .8);
  policy.setMode('detailed');
  for (let second = 0; second < 5; second++) assert.equal(policy.observeFps(8, true), false);
  assert.equal(policy.quality, 'standard', 'explicit detailed remains an actual choice');
  policy.setMode('auto');
  assert.equal(policy.observeFps(12, true), false); assert.equal(policy.observeFps(12, true), false);
  assert.equal(policy.observeFps(12, true), true); assert.equal(policy.quality, 'light');
  policy.setMode('detailed'); assert.equal(policy.quality, 'standard', 'a user can restore detail after Auto changed it');
});

test('graphics: capped menus, interruption and invalid FPS never masquerade as a slow racing device', () => {
  const policy = new GraphicsPolicy();
  for (let second = 0; second < 8; second++) policy.observeFps(15, false);
  assert.equal(policy.quality, 'standard');
  policy.observeFps(10, true); policy.observeFps(10, true); policy.observeFps(0, false);
  assert.equal(policy.observeFps(10, true), false); assert.equal(policy.quality, 'standard');
  policy.observeFps(60, true); policy.observeFps(NaN, true);
  assert.equal(policy.observeFps(10, true), false); assert.equal(policy.quality, 'standard');
  assert.equal(graphicsMode('unexpected'), 'auto'); assert.equal(graphicsMode(null), 'auto');
  assert.equal(policy.pixelRatio(Infinity), 1); assert.equal(policy.pixelRatio(-2), 1);
});

test('render pacing: menus draw at most15FPS while every racing callback remains available', () => {
  const pacer = new RenderPacer(); let menus = 0, racing = 0;
  for (let tick = 0; tick < 120; tick++) menus += Number(pacer.shouldRender(tick * 1000 / 60, false, {}));
  assert.ok(menus >= 29 && menus <= 30, `got ${menus} draws in2s`);
  for (let tick = 120; tick < 240; tick++) racing += Number(pacer.shouldRender(tick * 1000 / 60, true, {}));
  assert.equal(racing, 120);
});

test('render pacing: hidden documents and opaque dialogs draw nothing and resume immediately', () => {
  const pacer = new RenderPacer(); assert.equal(pacer.shouldRender(0, true, {}), true);
  for (let tick = 1; tick <= 60; tick++) assert.equal(pacer.shouldRender(tick * 16, true, { hidden: true }), false);
  assert.equal(pacer.shouldRender(961, true, {}), true);
  assert.equal(pacer.shouldRender(962, false, { opaqueDialog: true }), false);
  assert.equal(pacer.shouldRender(963, false, {}), true, 'closing dialog does not wait for menu interval');
  assert.equal(pacer.shouldRender(964, false, {}), false);
  pacer.invalidate(); assert.equal(pacer.shouldRender(965, false, {}), true);
});

for (const id of ['forest', 'sky', 'harbor']) test(`graphics: ${id} loses optional clutter but keeps named landmarks and every road structure`, () => {
  const track = getTrack(id), scenery = buildTrackExtras(track);
  const world = scenery.children.find(child => child.name === `world-${id}`)!;
  const landmarks = world.children.filter(child => child.name && !/-\d+$/.test(child.name));
  const structureIds = track.elevations.map(feature => feature.id);
  const count = () => { let vertices = 0; scenery.traverseVisible(object => {
    if (object instanceof THREE.Mesh) vertices += object.geometry.getAttribute('position').count;
  }); return vertices; };
  const before = count(), reduction = reduceSceneryDetails(scenery), after = count();
  assert.ok(landmarks.length > 0); assert.ok(landmarks.every(landmark => landmark.visible));
  assert.ok(structureIds.every(name => scenery.children.some(child => child.name === name && child.visible)));
  // Harbor has only its three signature structures; those must all survive.
  if (reduction.optional) { assert.ok(after < before); assert.equal(reduction.visible, Math.ceil(reduction.optional / 3)); }
  else assert.equal(after, before);
  const geometries = new Set<THREE.BufferGeometry>();
  scenery.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
  for (const geometry of geometries) geometry.dispose();
});
