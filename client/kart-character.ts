import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterId } from '../shared/characters';

// Original geometric caricatures. No photographs, textures or external assets.
const sphere = new THREE.SphereGeometry(1, 12, 8);
const cube = new THREE.BoxGeometry(1, 1, 1);
const limb = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone = new THREE.ConeGeometry(1, 1, 5);
const ring = new THREE.TorusGeometry(1, .17, 5, 16);
const templates = new Map<CharacterId, THREE.Group>();
const material = (name: string, color: string, roughness = .7, metalness = 0) => {
  const result = new THREE.MeshStandardMaterial({ color, roughness, metalness }); result.name = name; return result;
};
const black = material('CharacterBlack', '#141b21');
const ivory = material('CharacterIvory', '#fff1d0');
const gold = material('CharacterGold', '#e3b337', .32, .6);
const red = material('CharacterRed', '#b92f39');
const paint = material('DriverPaint', '#ffffff', .5);

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
  position: number[], scale: number[]) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.fromArray(position); result.scale.fromArray(scale);
  parent.add(result); return result;
}

/** Merge only each rigid part; moving facial/arm groups remain independent. */
function batch(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originals: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const list = batches.get(object.material) ?? []; list.push(geometry); batches.set(object.material, list);
    originals.push(object);
  });
  for (const object of originals) object.removeFromParent();
  for (const [mat, geometries] of batches) {
    mesh(group, mergeGeometries(geometries)!, mat, [0, 0, 0], [1, 1, 1]);
    for (const geometry of geometries) geometry.dispose();
  }
}

function template(id: Exclude<CharacterId, 'racer'>) {
  const cached = templates.get(id); if (cached) return cached;
  const driver = new THREE.Group(); driver.name = 'LagonDriver'; driver.userData.role = 'driver';
  driver.userData.characterId = id;
  const queen = id === 'queen', obama = id === 'obama', trump = id === 'trump', kim = id === 'kim';
  const skin = material('CharacterSkin', queen ? '#edc7a9' : obama ? '#985b3c' : trump ? '#e5a071' : '#ecc8ad');
  const suit = material('CharacterSuit', queen ? '#6091c5' : kim ? '#303d42' : '#253c59');
  const hair = material('CharacterHair', queen ? '#deded8' : trump ? '#e5ba54' : '#172024');
  const torso = new THREE.Group(); torso.name = 'CharacterTorso'; driver.add(torso);
  mesh(torso, sphere, suit, [0, .38, -.04], [kim ? .42 : .36, .43, .3]);
  mesh(torso, sphere, suit, [0, .08, .04], [.35, .17, .3]);
  for (const side of [-1, 1]) {
    mesh(torso, sphere, suit, [side * .2, .045, .35], [.17, .15, .37]);
    mesh(torso, sphere, black, [side * .23, -.025, .65], [.17, .1, .22]);
  }
  mesh(torso, limb, skin, [0, .77, -.02], [.13, .22, .13]);
  if (queen) {
    const sash = mesh(torso, cube, paint, [0, .44, .231], [.095, .57, .035]); sash.rotation.z = -.4;
    for (let index = 0; index < 9; index++) {
      const angle = (index / 8 - .5) * Math.PI;
      mesh(torso, sphere, ivory, [Math.sin(angle) * .23, .64 - Math.cos(angle) * .1, .245], [.033, .033, .026]);
    }
    mesh(torso, sphere, gold, [-.22, .46, .26], [.06, .06, .025]);
  } else if (kim) {
    mesh(torso, cube, paint, [0, .73, .19], [.22, .035, .04]);
    for (let i = 0; i < 4; i++) mesh(torso, sphere, gold, [0, .6 - i * .12, .265], [.023, .023, .023]);
    mesh(torso, cube, red, [.18, .54, .25], [.1, .06, .025]);
  } else {
    mesh(torso, cube, ivory, [0, .54, .24], [.18, .33, .045]);
    mesh(torso, cube, red, [0, .48, .282], [trump ? .105 : .07, trump ? .49 : .3, .045]);
    for (const side of [-1, 1]) {
      const lapel = mesh(torso, cube, suit, [side * .13, .6, .255], [.09, .29, .05]); lapel.rotation.z = side * .33;
    }
    mesh(torso, sphere, paint, [.22, .59, .254], [.039, .039, .025]);
  }
  batch(torso);

  const head = new THREE.Group(); head.name = 'CharacterHead'; head.position.set(0, 1.12, -.035); driver.add(head);
  const face = new THREE.Group(); head.add(face);
  const headWidth = kim ? .46 : obama ? .35 : .4;
  mesh(face, sphere, skin, [0, 0, 0], [headWidth, kim ? .43 : .46, .36]);
  for (const side of [-1, 1]) mesh(face, sphere, skin, [side * (headWidth + .005), -.025, -.005],
    [obama ? .125 : .085, obama ? .16 : .11, .075]);
  mesh(face, sphere, skin, [0, -.025, .355], [obama ? .082 : .075, .09, .08]);
  if (queen) {
    for (let i = 0; i < 11; i++) {
      const angle = i / 10 * Math.PI;
      mesh(face, sphere, hair, [Math.cos(angle) * .33, .17 + Math.sin(angle) * .22, -.025], [.15, .145, .145]);
    }
    for (const side of [-1, 1]) {
      mesh(face, sphere, hair, [side * .35, -.02, -.12], [.125, .22, .2]);
      mesh(face, sphere, ivory, [side * .43, -.13, .06], [.046, .052, .04]);
    }
    const crown = mesh(face, ring, gold, [0, .39, -.015], [.32, .25, .32]); crown.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      mesh(face, cone, gold, [Math.cos(angle) * .26, .53, Math.sin(angle) * .25], [.072, .22, .07]);
    }
    mesh(face, sphere, red, [0, .465, .259], [.043, .055, .027]);
  } else if (obama) {
    mesh(face, sphere, hair, [0, .24, -.02], [.353, .24, .335]);
    const grey = material('CharacterGreyHair', '#7f807a');
    for (const side of [-1, 1]) mesh(face, sphere, grey, [side * .31, .16, -.015], [.045, .12, .12]);
  } else if (trump) {
    mesh(face, sphere, hair, [0, .28, -.065], [.41, .235, .34]);
    const fringe = mesh(face, sphere, hair, [-.12, .33, .22], [.38, .13, .17]); fringe.rotation.z = -.2;
    mesh(face, sphere, hair, [.315, .15, -.015], [.07, .19, .21]);
  } else {
    mesh(face, cube, hair, [0, .315, -.07], [.72, .27, .53]);
    mesh(face, sphere, hair, [0, .36, -.05], [.39, .18, .32]);
    for (const side of [-1, 1]) mesh(face, cube, hair, [side * .36, .1, -.13], [.065, .3, .32]);
  }
  batch(face);
  const eyes = new THREE.Group(); eyes.name = 'CharacterEyes'; head.add(eyes);
  for (const side of [-1, 1]) {
    mesh(eyes, sphere, ivory, [side * .143, .055, .317], [.07, .046, .031]);
    mesh(eyes, sphere, black, [side * .14, .055, .347], [.029, .033, .012]);
  }
  batch(eyes);
  const brows = new THREE.Group(); brows.name = 'CharacterBrows'; brows.position.set(0, .13, .32); head.add(brows);
  for (const side of [-1, 1]) {
    const brow = mesh(brows, cube, hair, [side * .14, 0, 0], [.135, .03, .038]); brow.rotation.z = side * (trump ? .14 : -.08);
  }
  batch(brows);
  const mouth = mesh(head, sphere, queen ? red : black, [0, -.17, .329], [obama ? .155 : .115, .026, .018]);
  mouth.name = 'CharacterMouth'; mouth.userData.baseScale = mouth.scale.toArray();
  const smile = mesh(head, cube, ivory, [0, -.165, .346], [obama ? .21 : .14, .016, .015]); smile.name = 'CharacterSmile';

  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = side === 1 ? 'CharacterWaveArm' : 'CharacterFixedArm';
    arm.position.set(side * .3, .57, -.015); driver.add(arm);
    const upper = mesh(arm, limb, suit, [0, 0, 0], [.115, .3, .115]); upper.name = 'UpperArm';
    const lower = mesh(arm, limb, suit, [0, 0, 0], [.105, .3, .105]); lower.name = 'LowerArm';
    const hand = mesh(arm, sphere, skin, [0, 0, 0], [.12, .115, .1]); hand.name = 'CharacterHand';
  }
  templates.set(id, driver); return driver;
}

/** Copy transforms, share static meshes; player paint is cloned by KartModelInstance. */
export function addCartoonDriver(root: THREE.Group, body: THREE.Object3D, id: Exclude<CharacterId, 'racer'>, fallback: boolean) {
  root.updateMatrixWorld(true);
  const seatMarker = root.getObjectByName('SeatMount'), steeringMarker = root.getObjectByName('SteeringMount');
  const seat = seatMarker ? body.worldToLocal(seatMarker.getWorldPosition(new THREE.Vector3())) : undefined;
  const steering = steeringMarker ? body.worldToLocal(steeringMarker.getWorldPosition(new THREE.Vector3())) : undefined;
  const driver = template(id).clone(true);
  driver.position.set(seat?.x ?? 0, seat ? seat.y + .11 : .86, seat?.z ?? -.22);
  const size = fallback ? 1 : .82; driver.scale.setScalar(size); body.add(driver);
  for (const side of [-1, 1]) {
    const arm = driver.getObjectByName(side === 1 ? 'CharacterWaveArm' : 'CharacterFixedArm')!;
    const hand = steering ? new THREE.Vector3(side * .245 / size, (steering.y - .11 - driver.position.y) / size,
      (steering.z - .045 - driver.position.z) / size) : new THREE.Vector3(side * .29, .38, .43);
    const elbow = new THREE.Vector3(side * .4, (arm.position.y + hand.y) / 2 - .13, hand.z * .52);
    const upper = arm.getObjectByName('UpperArm')!, lower = arm.getObjectByName('LowerArm')!;
    for (const [segment, a, b] of [[upper, arm.position, elbow], [lower, elbow, hand]] as const) {
      segment.position.copy(a).add(b).multiplyScalar(.5).sub(arm.position);
      const direction = b.clone().sub(a); segment.scale.y = direction.length();
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    }
    arm.getObjectByName('CharacterHand')!.position.copy(hand).sub(arm.position);
  }
  const accessory = new THREE.Group(); accessory.name = 'CharacterAccessory'; body.add(accessory);
  if (id === 'queen') {
    // A tiny throne back and two royal pennants: visual only, inside the kart footprint.
    mesh(accessory, cube, red, [0, driver.position.y + .5, driver.position.z - .36], [.66, .85, .09]);
    for (const side of [-1, 1]) {
      mesh(accessory, limb, gold, [side * .36, driver.position.y + .55, driver.position.z - .38], [.022, .95, .022]);
      mesh(accessory, sphere, gold, [side * .36, driver.position.y + 1.04, driver.position.z - .38], [.05, .055, .05]);
    }
  } else if (id === 'obama') {
    const z = (steering?.z ?? .6) + .25;
    mesh(accessory, cube, material('CharacterPodium', '#624430'), [0, .55, z], [.42, .26, .15]);
    mesh(accessory, limb, black, [-.1, .8, z], [.015, .25, .015]);
    mesh(accessory, sphere, black, [-.1, .94, z + .03], [.04, .03, .05]);
    mesh(accessory, sphere, gold, [0, .56, z + .085], [.065, .065, .015]);
  } else if (id === 'trump') {
    const z = driver.position.z - .48;
    mesh(accessory, cube, gold, [0, .55, z], [.8, .1, .26]);
    for (const side of [-1, 1]) mesh(accessory, cube, gold, [side * .3, .76, z], [.17, .45, .17]);
    mesh(accessory, cube, gold, [0, .94, z], [.85, .12, .18]);
  } else {
    // Exaggerated command-chair antennas, without weapon geometry or real insignia.
    mesh(accessory, cube, suitForCommand(), [0, driver.position.y + .35, driver.position.z - .38], [.72, .62, .12]);
    for (const side of [-1, 1]) {
      mesh(accessory, limb, black, [side * .36, driver.position.y + .8, driver.position.z - .46], [.014, .9, .014]);
      mesh(accessory, sphere, red, [side * .36, driver.position.y + 1.27, driver.position.z - .46], [.04, .04, .04]);
    }
  }
  batch(accessory);
}

let commandMaterial: THREE.MeshStandardMaterial | undefined;
function suitForCommand() { return commandMaterial ??= material('CharacterCommandChair', '#334547'); }
