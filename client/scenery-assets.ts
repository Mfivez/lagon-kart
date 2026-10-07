import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const TREE_URL = '/models/scenery/kenney-tree-v1.glb';
let tree: THREE.Group | null = null;
let loading: Promise<void> | null = null;
let state: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
/** One same-origin request per page. Failure keeps the procedural forest available. */
export function preloadSceneryAssets(): Promise<void> {
  if (loading) return loading;
  state = 'loading';
  loading = new GLTFLoader().loadAsync(TREE_URL).then(gltf => {
    tree = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(tree), size = bounds.getSize(new THREE.Vector3());
    tree.position.set(-(bounds.min.x+bounds.max.x)/2, -bounds.min.y, -(bounds.min.z+bounds.max.z)/2);
    const normalized = new THREE.Group(); normalized.add(tree); normalized.scale.setScalar(1/size.y);
    tree = normalized; state = 'ready';
    tree.traverse(object => { if (object instanceof THREE.Mesh) {
      object.castShadow = true; object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.roughness = .94; material.metalness = 0;
          material.color.set(material.name === 'wood' ? '#80664b' : '#558668');
        }
      }
    } });
  }).catch(() => { state = 'fallback'; });
  return loading;
}
/** The cached source is never disposed by scenery batching: clone its geometry per built scene.
 * Materials are immutable and shared by all trees; static renderer batching combines them. */
export function createSceneryTree(height: number): THREE.Group | null {
  if (!tree) return null;
  const instance = tree.clone(true);
  instance.scale.multiplyScalar(height);
  instance.traverse(object => { if (object instanceof THREE.Mesh) object.geometry = object.geometry.clone(); });
  instance.userData.role = 'kenney-tree';
  return instance;
}
export function sceneryAssetDiagnostics() { return { state, url: TREE_URL, requests: loading ? 1 : 0 }; }
