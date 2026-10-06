import * as THREE from 'three';
import { trackElevation, trackPoint, type TrackDefinition, type TrackElevation } from '../shared/track';
import { getTrackEvent, nearestDriveableTrack } from '../shared/track-events';

// Original, code-generated scenery: no external textures, models or paid assets.
// Materials survive track changes; geometry belongs to this group and can be batched/disposed.
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, glow = false) {
  const key = `${color}:${glow}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: .88,
      emissive: glow ? color : '#000000', emissiveIntensity: glow ? .32 : 0 });
    materials.set(key, material);
  }
  return material;
}
export function hasExtraScenery(track: TrackDefinition): boolean {
  return ['volcano', 'forest', 'harbor', 'sky', 'foundry', 'castle'].includes(track.theme);
}

/** Add before GameRenderer.batchScenery(). The renderer draws the road at trackElevation(). */
export function buildTrackExtras(track: TrackDefinition): THREE.Group {
  const result = new THREE.Group(); result.name = `scenery-${track.id}`;
  result.userData.theme = track.theme; result.userData.structures = [] as string[];
  if (!hasExtraScenery(track)) return result;
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const tapered = new THREE.CylinderGeometry(.62, 1, 1, 8);
  const cone = new THREE.ConeGeometry(1, 1, 8);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const torus = new THREE.TorusGeometry(1, .17, 5, 20);
  const vectorY = new THREE.Vector3(0, 1, 0);
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, glow = false) => {
    const mesh = new THREE.Mesh(geometry, mat(color, glow));
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const box = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    add(parent, boxGeometry, color, x, y, z, sx, sy, sz);
  const beam = (parent: THREE.Object3D, color: string, a: THREE.Vector3, b: THREE.Vector3, width: number) => {
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = box(parent, color, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, width, direction.length(), width);
    mesh.quaternion.setFromUnitVectors(vectorY, direction.normalize()); return mesh;
  };
  const group = (name: string, x = 0, z = 0) => {
    const item = new THREE.Group(); item.name = name; item.position.set(x, 0, z);
    result.add(item); (result.userData.structures as string[]).push(name); return item;
  };
  const clear = (x: number, z: number, radius: number) => {
    const road = nearestDriveableTrack(x, z, track.id, 2, 3);
    return road.distance > road.width / 2 + radius + 7;
  };
  const roadPosition = (progress: number, offset = 0, height = 0) => {
    const point = trackPoint(progress, track.id);
    return new THREE.Vector3(point.x + Math.cos(point.angle) * offset,
      trackElevation(progress, track.id) + height, point.z - Math.sin(point.angle) * offset);
  };
  const branches = getTrackEvent(track.id, 2, 3).branches;
  const branchGap = (point: THREE.Vector3) => branches.some(branch => branch.points.some(sample =>
    Math.hypot(sample.x - point.x, sample.z - point.z) < branch.width / 2 + 2));
  const structural = track.theme === 'forest' ? '#826043' : track.theme === 'castle' ? '#a4a598'
    : track.theme === 'sky' ? '#ae99be' : track.theme === 'volcano' ? '#45484c' : '#526e76';
  const trim = track.theme === 'forest' ? '#c4a56d' : track.theme === 'castle' ? '#c9c5b4' : track.palette.accent;

  function bridge(feature: TrackElevation) {
    const bridge = group(feature.id);
    const steps = Math.ceil((feature.end - feature.start) / 5);
    for (let i = 0; i < steps; i++) {
      const aProgress = feature.start + (feature.end - feature.start) * i / steps;
      const bProgress = feature.start + (feature.end - feature.start) * (i + 1) / steps;
      const a = roadPosition(aProgress), b = roadPosition(bProgress);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const deck = box(bridge, structural, (a.x + b.x) / 2, (a.y + b.y) / 2 - .35,
        (a.z + b.z) / 2, track.width + 3, .5, length + .1);
      deck.rotation.set(-Math.atan2(b.y - a.y, length), Math.atan2(b.x - a.x, b.z - a.z), 0, 'YXZ');
      for (const side of [-1, 1]) {
        const offset = side * (track.width / 2 + 1.5);
        const railA = roadPosition(aProgress, offset, 1.1), railB = roadPosition(bProgress, offset, 1.1);
        const railMiddle = new THREE.Vector3().addVectors(railA, railB).multiplyScalar(.5);
        if (branchGap(railA) || branchGap(railB) || branchGap(railMiddle)) continue;
        beam(bridge, trim, railA, railB, .24);
        const foot = roadPosition(aProgress, offset, -.15);
        beam(bridge, structural, foot, railA, .24);
        if (i % 2 === 0 && a.y > 1.3) {
          const post = roadPosition(aProgress, offset, -.45);
          box(bridge, structural, post.x, (post.y - 1.4) / 2, post.z, 1.2, post.y + 1.4, 1.2);
          if (track.theme === 'harbor' || track.theme === 'foundry')
            beam(bridge, trim, roadPosition(aProgress, offset, .2), roadPosition(bProgress, offset, 1.1), .18);
        }
      }
    }
    const middle = (feature.start + feature.end) / 2, p = trackPoint(middle, track.id);
    if (track.theme !== 'sky') {
      // Water/lava is below the elevated deck and never obscures the road.
      const river = box(bridge, track.theme === 'volcano' ? '#f19a47' : track.palette.water,
        p.x, -.08, p.z, track.width + 38, .035, 24);
      river.rotation.y = p.angle; river.castShadow = false;
    }
  }
  function jump(feature: TrackElevation) {
    const ramp = group(feature.id), steps = Math.ceil((feature.end - feature.start) / 2);
    // Side supports reveal the genuine ramp height, with no invisible jump trigger elsewhere.
    for (let i = 0; i < steps; i++) {
      const progress = feature.start + (feature.end - feature.start) * (i + .5) / steps;
      const p = trackPoint(progress, track.id), y = trackElevation(progress, track.id);
      for (const side of [-1, 1]) {
        const support = box(ramp, structural, p.x + Math.cos(p.angle) * side * (track.width / 2 + .9),
          y / 2, p.z - Math.sin(p.angle) * side * (track.width / 2 + .9), 1.1, Math.max(.05, y), 2.1);
        support.rotation.y = p.angle;
      }
    }
    for (let progress = feature.start + 3; progress < feature.end - 2; progress += 5) {
      const p = trackPoint(progress, track.id), arrows = new THREE.Group();
      arrows.position.copy(roadPosition(progress, 0, .13)); arrows.rotation.set(-Math.atan2(feature.height, feature.end - feature.start), p.angle, 0, 'YXZ');
      for (const lane of [-5, 0, 5]) for (const side of [-1, 1]) {
        const arrow = box(arrows, '#fff2b1', lane + side * .55, 0, 0, .28, .04, 1.55);
        arrow.rotation.y = -side * .65;
      }
      ramp.add(arrows);
    }
    for (const side of [-1, 1]) {
      const p = roadPosition(feature.end, side * (track.width / 2 + 2.2));
      box(ramp, structural, p.x, p.y + 1.5, p.z, .25, 3, .25);
      const flag = box(ramp, trim, p.x, p.y + 2.5, p.z, 1.7, .7, .15);
      flag.rotation.y = trackPoint(feature.end, track.id).angle;
      // The landing zone is clear; only small markers sit outside the full road width.
      const landing = roadPosition(feature.end + 42, side * (track.width / 2 + 2));
      add(ramp, cone, trim, landing.x, .8, landing.z, .55, 1.6, .55);
    }
  }
  for (const feature of track.elevations) feature.kind === 'bridge' ? bridge(feature) : jump(feature);

  let seed = 7159 + track.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const scatter = (count: number, radius: number, footprint: number, build: (parent: THREE.Group, i: number) => void) => {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, distance = 48 + random() * radius;
      const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
      if (!clear(x, z, footprint)) continue;
      const prop = group(`${track.theme}-prop-${i}`, x, z); prop.rotation.y = angle;
      build(prop, i);
    }
  };
  if (track.theme === 'volcano') {
    const crater = group('volcano-crater');
    add(crater, tapered, '#55504c', 0, 17, 0, 42, 34, 42);
    const lip = add(crater, torus, '#403f43', 0, 34, 0, 27, 27, 13); lip.rotation.x = Math.PI / 2;
    add(crater, cylinder, '#ed8b3f', 0, 32.5, 0, 23, .4, 23, true);
    for (let i = 0; i < 4; i++) add(crater, sphere, '#c29a81', i * 3 - 4, 45 + i * 10, 0, 7 + i * 3, 6 + i * 2, 7 + i * 2);
    scatter(50, 180, 7, (prop, i) => {
      const height = 4 + random() * 12;
      add(prop, tapered, i % 2 ? '#494b4c' : '#696159', 0, height / 2, 0, 3 + random() * 2, height, 3.5);
      if (i % 4 === 0) add(prop, sphere, '#f3ad50', 2, .5, 1, 2, .5, 2, true);
    });
  } else if (track.theme === 'forest') {
    scatter(85, 185, 8, (prop, i) => {
      const height = 12 + random() * 16;
      add(prop, tapered, '#826345', 0, height * .45, 0, 1.3, height * .9, 1.3);
      add(prop, cone, i % 2 ? '#416e48' : '#568152', 0, height, 0, 7, height * .8, 7);
      add(prop, cone, '#739660', 0, height * 1.23, 0, 4.5, height * .6, 4.5);
      if (i % 5 === 0) {
        add(prop, cylinder, '#ead5b1', 4, .6, 0, .2, 1.2, .2);
        add(prop, sphere, '#cc7c62', 4, 1.3, 0, 1.2, .45, 1.2);
      }
    });
    const grove = group('giant-tree-grove');
    for (const [x, z] of [[-15, -10], [12, 14], [15, -19]]) {
      add(grove, tapered, '#806145', x, 17, z, 3.5, 34, 3.5);
      add(grove, cone, '#426f4a', x, 35, z, 12, 30, 12);
      add(grove, cone, '#659258', x, 48, z, 8, 24, 8);
    }
  } else if (track.theme === 'harbor') {
    const yard = group('cargo-yard');
    const cargoColors = ['#bc755f', '#6f8d9a', '#d8b56a'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 10, z = (row - 1) * 15;
      box(yard, cargoColors[(row + i) % 3]!, x, 3, z, 8.5, 6, 12);
      for (let rib = -3; rib <= 3; rib += 2) box(yard, '#e8d6b1', x + rib, 3, z + 6.03, .13, 5.4, .12);
    }
    scatter(24, 205, 12, (prop, i) => {
      if (i % 3 !== 0) { box(prop, cargoColors[i % 3]!, 0, 3, 0, 8, 6, 12); return; }
      for (const x of [-5, 5]) box(prop, '#ddbd6b', x, 13, 0, 1.2, 26, 1.2);
      box(prop, '#ddbd6b', 2, 25, 0, 29, 1.4, 1.6);
      box(prop, '#6e858c', -3, 23, 0, 4, 3, 3);
      box(prop, '#455965', 12, 18, 0, .15, 13, .15);
      box(prop, '#455965', 12, 11.5, 0, 3, .5, .6);
    });
    const boat = group('cargo-ship', 40, 45);
    add(boat, sphere, '#546c7a', 0, 1.5, 0, 9, 3, 24);
    box(boat, '#e8e0c8', 0, 6, -10, 10, 6, 7);
    box(boat, '#6a96a2', 0, 7, -6.4, 8, 1.7, .1);
    for (let i = 0; i < 3; i++) box(boat, cargoColors[i]!, 0, 5, 2 + i * 6, 7, 4, 5);
    const basin = box(result, track.palette.water, 40, -.07, 40, 37, .04, 68); basin.castShadow = false;
  } else if (track.theme === 'sky') {
    scatter(32, 205, 12, (prop, i) => {
      if (i % 2 === 0) {
        for (let puff = 0; puff < 3; puff++) add(prop, sphere, '#f0f4ee', (puff - 1) * 6, 5 + puff % 2 * 3, 0, 7, 4, 6);
      } else {
        const island = add(prop, cone, '#9c91ac', 0, -6, 0, 12, 14, 12); island.rotation.z = Math.PI;
        add(prop, cylinder, '#b9cc94', 0, 1, 0, 12, 1, 12);
        add(prop, cone, '#c7a3ce', 0, 7, 0, 3, 12, 3);
      }
    });
    const balloon = group('cloud-balloon', -20, 5);
    add(balloon, sphere, '#d4a0bc', 0, 45, 0, 16, 21, 16);
    box(balloon, '#bb986d', 0, 18, 0, 6, 4, 6);
    for (const x of [-2.5, 2.5]) for (const z of [-2.5, 2.5]) beam(balloon, '#e1d5b4', new THREE.Vector3(x, 20, z), new THREE.Vector3(x * 2, 33, z * 2), .17);
    for (let i = 0; i < 5; i++) add(result, sphere, '#eef2ed', -35 + i * 16, -4, 20, 18, 4, 15);
  } else if (track.theme === 'foundry') {
    const works = group('piston-foundry');
    box(works, '#8e7661', 0, 7, 0, 52, 14, 36);
    for (const x of [-18, 0, 18]) {
      box(works, '#687477', x, 16, 0, 12, 5, 34);
      add(works, cylinder, '#a67d67', x, 25, -12, 3.5, 34, 3.5);
      add(works, cylinder, '#d5c3a0', x, 39, -12, 3.65, 2, 3.65);
      add(works, sphere, '#c1b5a4', x + 1, 49, -12, 6, 5, 6);
      box(works, '#edac66', x, 7, 18.08, 6, 5, .15);
    }
    scatter(33, 180, 9, (prop, i) => {
      if (i % 3 === 0) {
        add(prop, tapered, '#a5a093', 0, 9, 0, 7, 18, 7);
        add(prop, cylinder, '#6a7476', 0, 17.5, 0, 5.2, 1, 5.2);
      } else {
        box(prop, '#536b72', 0, 1, 0, 9, 2, 7);
        for (const x of [-2.5, 2.5]) {
          add(prop, cylinder, '#b8b9a7', x, 5, 0, 1, 7, 1);
          add(prop, cylinder, '#dcad66', x, 8, 0, 2, 2, 2);
        }
      }
    });
  } else if (track.theme === 'castle') {
    const fortress = group('royal-citadel');
    for (const z of [-27, 27]) box(fortress, '#b4b29f', 0, 7, z, 54, 14, 3);
    for (const x of [-27, 27]) box(fortress, '#b4b29f', x, 7, 0, 3, 14, 54);
    for (const x of [-27, 27]) for (const z of [-27, 27]) {
      add(fortress, cylinder, '#aaa995', x, 11, z, 6.5, 22, 6.5);
      add(fortress, cone, '#9a83ad', x, 26, z, 8, 10, 8);
      box(fortress, '#e4d49a', x, 33, z, .22, 6, .22);
      box(fortress, '#ba8bb0', x + 2, 34.2, z, 4, 1.8, .18);
    }
    for (let i = -24; i <= 24; i += 6) for (const side of [-1, 1]) {
      box(fortress, '#cfccb6', i, 15.3, side * 27, 3, 3, 3.3);
      box(fortress, '#cfccb6', side * 27, 15.3, i, 3.3, 3, 3);
    }
    box(fortress, '#898f8b', 0, 13, 0, 20, 26, 20);
    add(fortress, cone, '#9a83ad', 0, 32, 0, 16, 16, 16);
    scatter(36, 175, 7, (prop, i) => {
      if (i % 3 === 0) {
        add(prop, cylinder, '#a7ab9d', 0, 4, 0, 3, 8, 3);
        add(prop, cone, '#9d8bb0', 0, 10, 0, 4, 5, 4);
      } else {
        add(prop, tapered, '#82745a', 0, 3, 0, .55, 6, .55);
        add(prop, sphere, '#7e9b63', 0, 7, 0, 4, 5, 4);
      }
    });
  }
  return result;
}
