import * as THREE from 'three';
import { createKartModel, createKartContactShadow, kartAssetDiagnostics, type KartModelInstance } from '../../client/kart-model';
import { KART_MODELS } from '../../shared/kart-catalog';
import { COLORS } from '../../shared/game';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#d6e5e5');
scene.add(new THREE.HemisphereLight('#efffff', '#526765', 2.6));
const sun = new THREE.DirectionalLight('#fff0d3', 3.1); sun.position.set(-8, 20, 9); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: .1, far: 60 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .025; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#bad0cb', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -.01; scene.add(ground);
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, .1, 100);
camera.position.set(10, 9, 18); camera.lookAt(0, 0.9, 0);
const instances: KartModelInstance[] = [];
await Promise.all(KART_MODELS.map(async (model, column) => {
  const copies = await Promise.all(COLORS.map(color => createKartModel(color, model.id)));
  copies.forEach((instance, index) => {
    instance.group.position.x = (column - 1) * 4.7;
    instance.group.visible = index === 0; scene.add(instance.group);
    if (index === 0) {
      const shadow = createKartContactShadow(); shadow.position.x = instance.group.position.x; scene.add(shadow);
    }
  });
  instances.push(...copies);
}));
instances.sort((a, b) => KART_MODELS.findIndex(m => m.id === a.modelId) - KART_MODELS.findIndex(m => m.id === b.modelId));
function draw() { renderer.render(scene, camera); }
function describe() {
  scene.updateMatrixWorld(true);
  return { asset: kartAssetDiagnostics(), karts: instances.map(instance => {
    const geometries = new Set<string>(), paints = new Set<string>(), colors = new Set<string>();
    const wheels: { role: string; name: string; position: number[]; rotation: number[]; front: boolean }[] = [];
    instance.group.traverse(object => {
      if (['wheel-pivot', 'wheel-spin'].includes(object.userData.role)) wheels.push({ role: object.userData.role,
        name: object.name, position: object.position.toArray(), rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        front: object.userData.front === true });
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry.uuid);
      if (object.userData.role !== 'paint') return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        paints.add(material.uuid); if (material instanceof THREE.MeshStandardMaterial) colors.add(material.color.getHexString());
      }
    });
    const body = instance.group.getObjectByName('Body')!;
    return { modelId: instance.modelId, source: instance.source, position: instance.group.position.toArray(),
      bodyRotation: body.rotation.toArray().slice(0, 3), bodyMinimumY: new THREE.Box3().setFromObject(body).min.y,
      wheels, geometries: [...geometries].sort(), paints: [...paints].sort(), colors: [...colors].sort() };
  }) };
}
const api = {
  describe,
  animate() {
    const kart = { speed: 28, turnVelocity: .9, driftDirection: 1, driftCharge: 1.1, stun: 0 };
    const before = JSON.stringify(kart);
    for (let frame = 0; frame < 30; frame++) for (const instance of instances) instance.animate(kart, 1 / 30, frame * 33);
    draw(); return { ...describe(), inputUnchanged: JSON.stringify(kart) === before };
  },
  repaint() { instances[0]!.setColor('#2255ff'); draw(); return describe(); },
  async recreate() {
    const model = instances[0]!;
    let disposedGeometry = 0;
    const observed = new Set<THREE.BufferGeometry>();
    model.group.traverse(object => { if (object instanceof THREE.Mesh) observed.add(object.geometry); });
    const listener = () => { disposedGeometry++; };
    for (const geometry of observed) geometry.addEventListener('dispose', listener);
    model.dispose(); instances.shift();
    const replacement = await createKartModel(COLORS[0]!, model.modelId);
    replacement.group.position.x = -4.7; scene.add(replacement.group); instances.unshift(replacement);
    for (const geometry of observed) geometry.removeEventListener('dispose', listener);
    draw(); return { ...describe(), disposedGeometry };
  },
  detail(id: string) {
    for (const instance of instances) instance.group.visible = false;
    const selected = instances.find(instance => instance.modelId === id)!;
    selected.group.visible = true;
    camera.position.set(selected.group.position.x + 4.6, 3.9, 6.1);
    camera.lookAt(selected.group.position.x, .95, 0); draw();
  },
};
(window as unknown as { __kartLibrary: typeof api }).__kartLibrary = api;
draw();
