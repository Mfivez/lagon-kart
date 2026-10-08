import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CUSTOM_TRACK_TEMPLATES, registerCustomTrack } from '../shared/custom-tracks.js';
import { trackElevation, trackPoint } from '../shared/track.js';
import { buildCrossingStructures, crossingCameraHeight, crossingSupportClear } from '../client/track-crossings.js';
import { reduceSceneryDetails } from '../client/graphics-scenery.js';

const track = registerCustomTrack({ id: 'custom-crossing-render', revision: 1,
  draft: structuredClone(CUSTOM_TRACK_TEMPLATES.find(template => template.id === 'figure-eight')!.draft),
  createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' });
const crossing = track.crossings![0]!;

test('the overpass has a solid ceiling and leaves the full lower road open', () => {
  const scene = buildCrossingStructures(track); scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const offset of [-track.width * .4, 0, track.width * .4]) {
    const p = trackPoint(crossing.lowerProgress, track.id);
    ray.ray.origin.set(p.x + Math.cos(p.angle) * offset, 1, p.z - Math.sin(p.angle) * offset);
    ray.ray.direction.set(0, 1, 0); ray.far = 20;
    const roof = ray.intersectObject(scene, true)[0];
    assert.ok(roof, 'a visible underside covers every driving lane');
    assert.ok(roof.point.y >= 4.95 && roof.point.y <= 5.05, `ceiling is ${roof.point.y}m`);
    for (let progress = crossing.lowerStart - 3; progress <= crossing.lowerEnd + 3; progress += 2) {
      const a = trackPoint(progress, track.id), b = trackPoint(progress + 2, track.id);
      const origin = new THREE.Vector3(a.x + Math.cos(a.angle) * offset, trackElevation(progress, track.id) + 1,
        a.z - Math.sin(a.angle) * offset);
      const destination = new THREE.Vector3(b.x + Math.cos(b.angle) * offset, trackElevation(progress + 2, track.id) + 1,
        b.z - Math.sin(b.angle) * offset);
      ray.ray.origin.copy(origin); ray.ray.direction.copy(destination.sub(origin)); ray.far = ray.ray.direction.length(); ray.ray.direction.normalize();
      assert.equal(ray.intersectObject(scene, true).length, 0, 'no deck, pier or wall blocks the lower driving lane');
    }
  }
  const top = trackPoint(crossing.upperProgress, track.id);
  ray.ray.origin.set(top.x, 8, top.z); ray.ray.direction.set(0, -1, 0); ray.far = 10;
  assert.ok(Math.abs(ray.intersectObject(scene, true)[0]!.point.y - 5.7) < .03, 'solid deck follows the upper road');
  const named = new Set<string>(); scene.traverse(object => named.add(object.name));
  assert.ok(named.has('tunnel-wall')); assert.ok(named.has('tunnel-mouth')); assert.ok(named.has('crossing-rail'));
  reduceSceneryDetails(scene); scene.traverse(object => assert.equal(object.visible, true, 'mobile quality keeps passage structures'));
});

test('supports respect every floor and the chase camera anticipates the tunnel roof', () => {
  assert.equal(crossingSupportClear(track, crossing.x, crossing.z, 0, 5), false, 'a pier through the lower road is forbidden');
  assert.equal(crossingSupportClear(track, crossing.x, crossing.z, 2.5, 4.9), true, 'a structure above the kart corridor is allowed');
  assert.equal(crossingSupportClear(track, crossing.x + 1000, crossing.z, 0, 10), true);
  assert.equal(crossingCameraHeight(crossing.lowerProgress, track.id), 3.1);
  assert.equal(crossingCameraHeight(crossing.lowerStart - 20, track.id), 3.1, 'camera enters before its chase offset touches the roof');
  assert.equal(crossingCameraHeight(crossing.upperProgress, track.id), undefined, 'upper deck keeps the ordinary camera');
});

test('an authored jump that already raises the upper road still has a visible tunnel ceiling', () => {
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES.find(template => template.id === 'figure-eight')!.draft);
  draft.elevations = [{ kind: 'jump', start: (crossing.upperProgress - 100) / track.length,
    end: (crossing.upperProgress + 100) / track.length, height: 40, approach: 0 }];
  const raised = registerCustomTrack({ id: 'custom-crossing-render-jump', revision: 1, draft,
    createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' });
  assert.equal(raised.crossings![0]!.height, 0, 'manual relief already provides sufficient clearance');
  const scene = buildCrossingStructures(raised); scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(crossing.x, 1, crossing.z), new THREE.Vector3(0, 1, 0));
  const hit = ray.intersectObject(scene, true)[0];
  assert.ok(hit, 'the underside exists even without an automatic height offset');
  assert.ok(hit.point.y > 18 && hit.point.y < 20);
});
