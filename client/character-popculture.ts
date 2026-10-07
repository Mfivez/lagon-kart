import * as THREE from 'three';
import {
  black, cone, cube, gold, ivory, material, mesh, paint, red, ring, sphere,
  type CharacterParts,
} from './character-shapes';

// Playful, original geometric costumes: no downloaded models, logos or textures.
const blue = material('CharacterOverallBlue', '#2461b4');
const green = material('CharacterForestGreen', '#3d914d');
const cobalt = material('CharacterSpikeBlue', '#286ed4', .57);
const peach = material('CharacterMuzzleCream', '#f3d3a0');
const darkBrown = material('CharacterDarkBrown', '#523522');
const steel = material('CharacterToolSteel', '#b5d2d4', .45, .35);
const yellow = material('CharacterSafetyYellow', '#edc83d');
const charcoal = material('CharacterMaskGrey', '#34434d', .4, .18);
const lens = material('CharacterHelmetLens', '#582c36', .28, .2);
const up = new THREE.Vector3(0, 1, 0);

function spike(parent: THREE.Object3D, color: THREE.Material, position: number[],
  scale: number[], direction: number[]) {
  const result = mesh(parent, cone, color, position, scale);
  result.quaternion.setFromUnitVectors(up, new THREE.Vector3().fromArray(direction).normalize());
  return result;
}

/** Add rigid costume details before the caller batches each animated body part. */
export function addPopCultureCostume(id: string, parts: CharacterParts): boolean {
  const { face, torso, skin, hair } = parts;
  switch (id) {
    case 'plumber': {
      mesh(face, sphere, hair, [0, .16, -.13], [.38, .25, .26]);
      mesh(face, sphere, red, [0, .325, -.025], [.445, .23, .355]);
      mesh(face, sphere, red, [0, .27, .29], [.44, .068, .23]);
      mesh(face, sphere, ivory, [0, .405, .317], [.1, .095, .025]);
      const badge = mesh(face, cube, gold, [0, .408, .345], [.035, .1, .014]);
      badge.rotation.z = -.35;
      for (const side of [-1, 1]) {
        mesh(face, sphere, hair, [side * .105, -.10, .363], [.15, .055, .033]);
        spike(face, hair, [side * .22, -.08, .351], [.034, .10, .026], [side, .5, 0]);
        mesh(torso, cube, blue, [side * .16, .535, .25], [.085, .34, .048]);
        mesh(torso, sphere, gold, [side * .16, .48, .304], [.035, .035, .016]);
      }
      mesh(face, sphere, skin, [0, -.015, .38], [.105, .105, .115]);
      mesh(torso, cube, blue, [0, .32, .25], [.45, .29, .09]);
      mesh(torso, cube, paint, [0, .34, .30], [.14, .095, .018]);
      return true;
    }
    case 'elf': {
      mesh(face, sphere, hair, [0, .20, -.08], [.405, .28, .31]);
      mesh(face, sphere, green, [0, .29, -.08], [.43, .22, .35]);
      spike(face, green, [0, .57, -.20], [.33, .70, .28], [.25, .78, -.55]);
      for (const side of [-1, 1]) {
        spike(face, skin, [side * .455, .02, .015], [.08, .30, .075], [side, .45, 0]);
        const lock = mesh(face, sphere, hair, [side * .315, .03, .15], [.075, .23, .11]);
        lock.rotation.z = side * -.17;
      }
      mesh(torso, cube, darkBrown, [0, .22, .26], [.61, .075, .06]);
      mesh(torso, cube, gold, [0, .22, .3], [.115, .1, .025]);
      // Oval toy shield stays within the kart silhouette, attached to the back.
      mesh(torso, sphere, gold, [0, .43, -.34], [.285, .37, .065]);
      mesh(torso, sphere, blue, [0, .43, -.391], [.245, .325, .028]);
      const crest = mesh(torso, cube, paint, [0, .46, -.425], [.125, .125, .018]);
      crest.rotation.z = Math.PI / 4;
      return true;
    }
    case 'hedgehog': {
      mesh(face, sphere, cobalt, [0, .07, -.115], [.44, .465, .34]);
      for (const side of [-1, 1]) {
        spike(face, cobalt, [side * .35, .25, -.13], [.20, .47, .18], [side, .5, -.3]);
        spike(face, cobalt, [side * .37, -.05, -.19], [.20, .47, .19], [side, -.25, -.65]);
        mesh(face, sphere, peach, [side * .10, -.135, .28], [.135, .15, .041]);
        mesh(torso, sphere, red, [side * .23, -.018, .65], [.177, .104, .228]);
        mesh(torso, cube, ivory, [side * .23, .074, .65], [.28, .024, .09]);
      }
      spike(face, cobalt, [0, -.13, -.37], [.235, .49, .22], [0, -.3, -1]);
      mesh(face, sphere, black, [0, -.02, .402], [.068, .055, .055]);
      mesh(torso, sphere, peach, [0, .425, .246], [.205, .265, .055]);
      return true;
    }
    case 'block': {
      mesh(face, cube, hair, [0, .29, -.025], [.79, .245, .69]);
      for (const side of [-1, 1]) {
        mesh(face, cube, hair, [side * .335, .095, -.14], [.12, .27, .47]);
      }
      mesh(face, cube, hair, [-.14, .17, .315], [.25, .08, .035]);
      mesh(torso, cube, blue, [0, .11, .29], [.50, .115, .12]);
      mesh(torso, cube, paint, [-.16, .45, .28], [.09, .09, .025]);
      // A little blunt pickaxe rides on the back rather than occupying a hand.
      const tool = new THREE.Group(); tool.position.set(.27, .43, -.35); tool.rotation.z = -.38; torso.add(tool);
      mesh(tool, cube, darkBrown, [0, 0, 0], [.065, .63, .065]);
      mesh(tool, cube, steel, [0, .24, -.015], [.41, .075, .09]);
      for (const side of [-1, 1]) {
        mesh(tool, cube, steel, [side * .17, .18, -.015], [.075, .09, .09]);
      }
      return true;
    }
    case 'chemist': {
      mesh(face, sphere, black, [0, .395, -.01], [.49, .063, .395]);
      mesh(face, cube, black, [0, .50, -.065], [.55, .205, .46]);
      mesh(face, sphere, black, [0, .59, -.065], [.286, .055, .24]);
      mesh(face, cube, charcoal, [0, .454, .173], [.54, .047, .023]);
      for (const side of [-1, 1]) {
        mesh(face, ring, black, [side * .145, .055, .357], [.115, .081, .05]);
        mesh(face, cube, black, [side * .258, .055, .275], [.023, .022, .19]);
      }
      mesh(face, cube, black, [0, .055, .365], [.085, .022, .021]);
      mesh(face, sphere, hair, [0, -.26, .27], [.14, .12, .042]);
      for (const side of [-1, 1]) {
        mesh(face, cube, hair, [side * .087, -.175, .311], [.042, .075, .026]);
        mesh(torso, cube, yellow, [side * .18, .40, .273], [.18, .16, .035]);
      }
      mesh(torso, cube, charcoal, [0, .415, .285], [.032, .47, .024]);
      mesh(torso, cube, ivory, [-.18, .49, .30], [.105, .05, .018]);
      return true;
    }
    case 'space': {
      mesh(face, sphere, black, [0, .12, -.105], [.445, .47, .345]);
      for (const side of [-1, 1]) {
        const cheek = mesh(face, cube, black, [side * .32, -.115, .16], [.155, .38, .24]);
        cheek.rotation.z = side * .17;
        const eye = mesh(face, sphere, lens, [side * .145, .065, .354], [.10, .058, .028]); eye.rotation.z = side * .15;
        mesh(face, sphere, charcoal, [side * .13, -.29, .322], [.055, .062, .05]);
      }
      mesh(face, cone, charcoal, [0, -.17, .358], [.145, .285, .075]);
      for (const x of [-.052, 0, .052]) mesh(face, cube, ivory, [x, -.222, .411], [.015, .064, .015]);
      const cape = mesh(torso, cube, black, [0, .265, -.355], [.78, .80, .085]); cape.rotation.x = -.15;
      mesh(torso, cube, charcoal, [0, .43, .277], [.32, .29, .035]);
      mesh(torso, cube, black, [0, .48, .3], [.25, .08, .018]);
      mesh(torso, cube, red, [-.084, .36, .307], [.054, .047, .014]);
      mesh(torso, cube, blue, [0, .36, .307], [.054, .047, .014]);
      mesh(torso, cube, paint, [.084, .36, .307], [.054, .047, .014]);
      return true;
    }
    default: return false;
  }
}
