import * as THREE from 'three';
import { createKartModel, createKartContactShadow, kartAssetDiagnostics, type KartModelInstance } from '../../client/kart-model';
import { KART_MODELS } from '../../shared/kart-catalog';
import { CHARACTERS } from '../../shared/characters';

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')!, antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#d6e5e5');
scene.add(new THREE.HemisphereLight('#efffff', '#526765', 2.6));
const sun = new THREE.DirectionalLight('#fff0d3', 3.1); sun.position.set(-8, 20, 9); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: .1, far: 70 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .025; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: '#bad0cb', roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -.01; scene.add(ground);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .1, 100);
camera.position.set(11, 13, 27); camera.lookAt(0, 1, 0);
const instances: KartModelInstance[] = [];
const shadows = new Map<string, THREE.Object3D>();
const labels = new Map<string, HTMLSpanElement>();
await Promise.all(KART_MODELS.map(async model => {
  for (const [index, character] of CHARACTERS.entries()) {
    const copies = await Promise.all(['#ee824e', '#287ccd'].map(color => createKartModel(color, model.id, character.id)));
    copies.forEach((instance, copy) => {
      instance.group.position.set((index % 5 - 2) * 4.5, 0, (Math.floor(index / 5) - 1) * 6);
      instance.group.visible = false; scene.add(instance.group);
    });
    instances.push(...copies);
    if (model.id === 'zsky') {
      const shadow = createKartContactShadow();
      shadow.position.x = copies[0]!.group.position.x; shadow.position.z = copies[0]!.group.position.z; scene.add(shadow);
      shadows.set(character.id, shadow);
      const label = document.createElement('span'); label.textContent = character.name;
      Object.assign(label.style, { position: 'absolute', padding: '4px 9px', borderRadius: '12px',
        background: '#ffffffde', color: '#14323a', font: '600 16px system-ui', transform: 'translate(-50%, -50%)', pointerEvents: 'none' });
      document.body.append(label); labels.set(character.id, label);
    }
  }
}));
instances.sort((a, b) => KART_MODELS.findIndex(m => m.id === a.modelId) - KART_MODELS.findIndex(m => m.id === b.modelId)
  || CHARACTERS.findIndex(c => c.id === a.characterId) - CHARACTERS.findIndex(c => c.id === b.characterId));
function draw() {
  renderer.render(scene, camera);
  for (const [id, label] of labels) {
    const selected = instances.find(instance => instance.characterId === id && instance.group.visible);
    label.hidden = !selected;
    if (selected) {
      const point = selected.group.position.clone().add(new THREE.Vector3(0, .1, 1.8)).project(camera);
      label.style.left = `${(point.x + 1) * innerWidth / 2}px`;
      label.style.top = `${(1 - point.y) * innerHeight / 2}px`;
    }
  }
}
function describe() {
  scene.updateMatrixWorld(true);
  return { asset: kartAssetDiagnostics(), karts: instances.map(instance => {
    const paints = new Set<string>(), colors = new Set<string>(), geometries = new Set<string>();
    let triangles = 0, meshes = 0;
    instance.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry.uuid); meshes++; triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      if (object.userData.role !== 'paint') return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        paints.add(material.uuid); if (material instanceof THREE.MeshStandardMaterial) colors.add(material.color.getHexString());
      }
    });
    const head = instance.group.getObjectByName('CharacterHead')!;
    return { modelId: instance.modelId, characterId: instance.characterId, source: instance.source,
      position: instance.group.position.toArray(), headRotation: [head.rotation.x, head.rotation.y, head.rotation.z],
      mouthScale: instance.group.getObjectByName('CharacterMouth')?.scale.toArray() ?? null,
      armRotation: instance.group.getObjectByName('CharacterWaveArm')?.rotation.toArray().slice(0, 3) ?? null,
      geometryIds: [...geometries].sort(), paints: [...paints].sort(), colors: [...colors].sort(), meshes, triangles,
      bodyMinimumY: new THREE.Box3().setFromObject(instance.group.getObjectByName('Body')!).min.y };
  }) };
}
const api = {
  describe,
  gallery(page?: number) {
    instances.forEach(instance => instance.group.visible = false);
    for (const [index, character] of CHARACTERS.entries()) {
      const selected = instances.find(instance => instance.characterId === character.id && instance.modelId === 'zsky')!;
      selected.group.visible = page === undefined || Math.floor(index / 5) === page;
      const shadow = shadows.get(character.id)!; shadow.visible = selected.group.visible;
    }
    const centerZ = page === undefined ? 0 : (page - 1) * 6;
    camera.position.set(page === undefined ? 12 : 7, page === undefined ? 23 : 9, centerZ + (page === undefined ? 29 : 24));
    camera.lookAt(0, .7, centerZ);
    document.querySelector('p')!.textContent = page === undefined
      ? `${CHARACTERS.length} pilotes — caricatures géométriques originales`
      : CHARACTERS.slice(page * 5, page * 5 + 5).map(character => character.name).join(' · ');
    draw();
  },
  detail(id: string, model = 'zsky') {
    instances.forEach(instance => instance.group.visible = false);
    for (const [key, shadow] of shadows) shadow.visible = key === id;
    const selected = instances.find(instance => instance.characterId === id && instance.modelId === model)!;
    selected.group.visible = true;
    camera.position.copy(selected.group.position).add(new THREE.Vector3(4.2, 3.8, 6.5));
    camera.lookAt(selected.group.position.x, 1.13, selected.group.position.z);
    document.querySelector('p')!.textContent = CHARACTERS.find(character => character.id === id)!.name + ' — caricature géométrique originale';
    draw();
  },
  animate(mode: 'impact' | 'victory' | 'drive', firstOnly = false) {
    const kart = { speed: mode === 'drive' ? 24 : 0, turnVelocity: mode === 'drive' ? .9 : 0,
      driftDirection: 0, driftCharge: 0, stun: mode === 'impact' ? 1 : 0, finished: mode === 'victory', rank: 1 };
    const before = JSON.stringify(kart);
    const active = firstOnly ? [instances.find(instance => instance.characterId === 'queen')!] : instances;
    for (let frame = 0; frame < 24; frame++) for (const instance of active) instance.animate(kart, 1 / 30, 900 + frame * 33);
    draw(); return { ...describe(), inputUnchanged: JSON.stringify(kart) === before };
  },
  repaint() { instances.find(instance => instance.characterId === 'queen')!.setColor('#e229d0'); draw(); return describe(); },
  async recreate() {
    const index = instances.findIndex(instance => instance.modelId === 'sprint' && instance.characterId === 'obama');
    const existing = instances[index]!;
    const geometry = new Set<THREE.BufferGeometry>(); let disposed = 0;
    existing.group.traverse(object => { if (object instanceof THREE.Mesh) geometry.add(object.geometry); });
    const listener = () => disposed++;
    for (const item of geometry) item.addEventListener('dispose', listener);
    existing.dispose();
    const replacement = await createKartModel('#ee824e', 'sprint', 'obama');
    replacement.group.visible = false; replacement.group.position.copy(existing.group.position);
    scene.add(replacement.group); instances[index] = replacement;
    for (const item of geometry) item.removeEventListener('dispose', listener);
    return { ...describe(), disposed };
  },
};
(window as unknown as { __characters: typeof api }).__characters = api;
api.gallery();
