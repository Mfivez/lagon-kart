import type * as THREE from 'three';

/** Only repeated decorative clusters are thinned. Bridges, rails, ramps,
 * loops and named signature landmarks remain visible at every quality. */
export function reduceSceneryDetails(root: THREE.Object3D): { optional: number; visible: number } {
  let optional = 0, visible = 0;
  root.traverse(object => {
    if (!object.name.startsWith('world-')) return;
    for (const child of object.children) {
      if (child.name && !/-\d+$/.test(child.name)) continue;
      child.visible = optional++ % 3 === 0;
      if (child.visible) visible++;
    }
  });
  return { optional, visible };
}
