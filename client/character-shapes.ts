import * as THREE from 'three';

// Small original primitives shared by every cached cartoon driver template.
export const sphere = new THREE.SphereGeometry(1, 12, 8);
export const cube = new THREE.BoxGeometry(1, 1, 1);
export const limb = new THREE.CylinderGeometry(1, 1, 1, 8);
export const cone = new THREE.ConeGeometry(1, 1, 5);
export const ring = new THREE.TorusGeometry(1, .17, 5, 16);
export const material = (name: string, color: string, roughness = .7, metalness = 0) => {
  const result = new THREE.MeshStandardMaterial({ color, roughness, metalness }); result.name = name; return result;
};
export const black = material('CharacterBlack', '#141b21');
export const ivory = material('CharacterIvory', '#fff1d0');
export const gold = material('CharacterGold', '#e3b337', .32, .6);
export const red = material('CharacterRed', '#b92f39');
export const paint = material('DriverPaint', '#ffffff', .5);

export interface CharacterParts {
  face: THREE.Group;
  torso: THREE.Group;
  skin: THREE.MeshStandardMaterial;
  suit: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
}

export function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
  position: number[], scale: number[]) {
  const result = new THREE.Mesh(geometry, mat);
  result.position.fromArray(position); result.scale.fromArray(scale);
  parent.add(result); return result;
}
