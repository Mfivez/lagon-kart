import * as THREE from 'three';
import { COLORS, createKart, createWorld, trackPoint } from '../../shared/game';

type AssetStatus = { status: 'loading' | 'ready' | 'failed'; loadCount: number; modelUrl: string;
  error?: string | null; [key: string]: unknown };
type Visual = { group: THREE.Group; label?: THREE.Sprite };
type RendererInternals = {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  karts: Map<string, Visual>; hemisphere: THREE.HemisphereLight; sun: THREE.DirectionalLight;
  kartAssets?: AssetStatus;
};

const mode = new URLSearchParams(location.search).get('model') === 'before' ? 'before' : 'after';
const Renderer = mode === 'before'
  ? (await import('./kart-baseline/client/renderer')).GameRenderer
  : (await import('../../client/renderer')).GameRenderer;
const instance = new Renderer(document.querySelector<HTMLCanvasElement>('#game')!);
const internals = instance as unknown as RendererInternals;
const world = createWorld(false, 'lagon');
world.phase = 'racing';
world.raceTime = 12;
world.players = COLORS.map((color, index) => {
  const kart = createKart(String(index), 'Pilote ' + (index + 1), color, index, 'lagon');
  const point = trackPoint(25 + Math.floor(index / 2) * 5, 'lagon');
  const side = index % 2 === 0 ? -2.8 : 2.8;
  Object.assign(kart, point, { x: point.x + Math.cos(point.angle) * side,
    z: point.z - Math.sin(point.angle) * side });
  return kart;
});
const initial = world.players.map(kart => ({ x: kart.x, z: kart.z, angle: kart.angle }));
let view: 'lineup' | 'detail' = 'lineup';
let clock = 5000;

function draw(dt = 0) {
  instance.render(world as never, world.players as never, '0', dt, clock);
  // The camera, lighting and renderer settings are fixed AFTER the ordinary
  // update. Neither the baseline camera smoothing nor later camera changes
  // may change the comparison. This fixture never connects to a game server.
  internals.hemisphere.color.set('#eaffed'); internals.hemisphere.groundColor.set('#736854');
  internals.hemisphere.intensity = 2.7;
  internals.sun.color.set('#fff0ce'); internals.sun.intensity = 3.1;
  internals.sun.position.set(-90, 150, 60);
  internals.renderer.setPixelRatio(1);
  internals.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  internals.renderer.toneMappingExposure = 1.2;
  internals.renderer.shadowMap.enabled = true;
  const reference = view === 'detail' ? initial[0]! : trackPoint(33, 'lagon');
  const forward = { x: Math.sin(reference.angle), z: Math.cos(reference.angle) };
  const right = { x: Math.cos(reference.angle), z: -Math.sin(reference.angle) };
  const side = view === 'detail' ? 5.7 : 18;
  const ahead = view === 'detail' ? 7.2 : 23;
  internals.camera.position.set(reference.x + forward.x * ahead + right.x * side,
    view === 'detail' ? 4.9 : 13, reference.z + forward.z * ahead + right.z * side);
  internals.camera.fov = view === 'detail' ? 36 : 47;
  internals.camera.near = .1; internals.camera.far = 900;
  internals.camera.lookAt(reference.x, view === 'detail' ? 1.0 : .8, reference.z);
  internals.camera.updateProjectionMatrix(); internals.camera.updateMatrixWorld();
  for (const [id, visual] of internals.karts) {
    visual.group.visible = view === 'lineup' || id === '0';
    if (visual.label) visual.label.visible = false;
  }
  internals.renderer.render(internals.scene, internals.camera);
}

function describe() {
  const karts = [...internals.karts].map(([id, visual]) => {
    const geometries: string[] = []; const modelGeometries: string[] = []; const paints: string[] = []; const paintColors: string[] = [];
    const wheels: { role: string; rotation: number[]; position: number[] }[] = [];
    let bodyRotation: number[] = [];
    let bodyMinY: number | null = null;
    let shadows = 0; let shadowTransparent = false; let meshes = 0;
    visual.group.traverse(object => {
      const role = object.userData.role as string | undefined;
      if (role === 'kart-body') {
        bodyRotation = [object.rotation.x, object.rotation.y, object.rotation.z];
        bodyMinY = new THREE.Box3().setFromObject(object).min.y;
      }
      if (role === 'wheel-pivot' || role === 'wheel-spin') wheels.push({ role,
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z], position: object.position.toArray() });
      if (!(object instanceof THREE.Mesh)) return;
      meshes++; geometries.push(object.geometry.uuid);
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== visual.group) {
        if (ancestor.userData.role === 'kart-model') { modelGeometries.push(object.geometry.uuid); break; }
        ancestor = ancestor.parent;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (role === 'paint') for (const material of materials) {
        paints.push(material.uuid);
        if ('color' in material) paintColors.push((material.color as THREE.Color).getHexString());
      }
      if (role === 'contact-shadow') { shadows++; shadowTransparent ||= materials.some(material => material.transparent); }
    });
    return { id, meshes, geometries: [...new Set(geometries)], modelGeometries: [...new Set(modelGeometries)].sort(),
      paints: [...new Set(paints)], paintColors: [...new Set(paintColors)], wheels, bodyRotation, bodyMinY, shadows, shadowTransparent };
  });
  return { mode, view, asset: internals.kartAssets ?? { status: 'baseline', loadCount: 0 }, karts,
    positions: world.players.map(kart => ({ id: kart.id, x: kart.x, z: kart.z, angle: kart.angle, color: kart.color })),
    camera: { position: internals.camera.position.toArray(), quaternion: internals.camera.quaternion.toArray(), fov: internals.camera.fov },
    lighting: { sunPosition: internals.sun.position.toArray(), sunColor: internals.sun.color.getHexString(),
      sunIntensity: internals.sun.intensity, hemisphereIntensity: internals.hemisphere.intensity, exposure: internals.renderer.toneMappingExposure },
    info: { calls: internals.renderer.info.render.calls, triangles: internals.renderer.info.render.triangles,
      geometries: internals.renderer.info.memory.geometries, textures: internals.renderer.info.memory.textures } };
}

const api = {
  draw,
  describe,
  setView(next: 'lineup' | 'detail') { view = next; draw(); },
  animate() {
    for (const kart of world.players) { kart.speed = 18; kart.turnVelocity = .65; }
    for (let frame = 0; frame < 15; frame++) { clock += 1000 / 30; draw(1 / 30); }
    return describe();
  },
  repaint() {
    world.players[0]!.color = '#22aa66'; draw(); return describe();
  },
  clearance() {
    let minimum = Infinity;
    for (const direction of [-1, 1]) {
      for (const kart of world.players) {
        kart.speed = 46; kart.turnVelocity = 1.32 * direction; kart.driftCharge = 1.5; kart.driftDirection = direction;
      }
      for (let frame = 0; frame < 12; frame++) {
        clock += 1000 / 30; draw(1 / 30);
        minimum = Math.min(minimum, ...describe().karts.map(kart => kart.bodyMinY ?? Infinity));
      }
    }
    for (const kart of world.players) { kart.speed = 0; kart.turnVelocity = 0; kart.driftCharge = 0; }
    draw(1 / 30);
    minimum = Math.min(minimum, ...describe().karts.map(kart => kart.bodyMinY ?? Infinity));
    return { minimum, roadY: .05, positions: describe().positions };
  },
  async recreate() {
    const observed = new Set<THREE.BufferGeometry>();
    internals.karts.get('0')!.group.traverse(object => {
      if (object instanceof THREE.Mesh) observed.add(object.geometry);
    });
    let disposedShared = 0;
    const disposed = () => { disposedShared++; };
    for (const geometry of observed) geometry.addEventListener('dispose', disposed);
    const last = world.players.pop()!; draw();
    const released = describe();
    world.players.push(last); draw();
    await new Promise(resolve => setTimeout(resolve, 0)); draw();
    const restored = describe();
    for (const geometry of observed) geometry.removeEventListener('dispose', disposed);
    return { released, restored, disposedShared };
  },
  cameraTracking() {
    // Deliberately bypass draw(): this test exercises the production chase
    // camera, without the fixed comparison camera or any server connection.
    const kart = world.players[0]!;
    kart.speed = 40; kart.turnVelocity = 0; kart.boost = 0; kart.driftCharge = 0;
    const start = { x: kart.x, z: kart.z, angle: kart.angle };
    const intervalMs = 333;
    const simulationDt = .1; // The exact upper bound used by client/main.ts.
    let unchanged = true;
    const render = () => {
      const expected = JSON.stringify(world);
      clock += intervalMs;
      instance.render(world as never, world.players as never, kart.id, simulationDt, clock);
      unchanged &&= JSON.stringify(world) === expected;
    };
    for (let frame = 0; frame < 8; frame++) render();
    const samples: { frame: number; elapsedMs: number; position: number[];
      projected: number[]; cameraPosition: number[]; goalLag: number }[] = [];
    const trailing = 11.5 + Math.min(2.5, kart.speed / 16);
    for (let frame = 1; frame <= 20; frame++) {
      const traveled = kart.speed * frame * intervalMs / 1000;
      kart.x = start.x + Math.sin(start.angle) * traveled;
      kart.z = start.z + Math.cos(start.angle) * traveled;
      render();
      internals.camera.updateMatrixWorld();
      const projected = new THREE.Vector3(kart.x, .8, kart.z).project(internals.camera);
      const goal = new THREE.Vector3(kart.x - Math.sin(start.angle) * trailing, 6.3,
        kart.z - Math.cos(start.angle) * trailing);
      samples.push({ frame, elapsedMs: frame * intervalMs, position: [kart.x, kart.z],
        projected: projected.toArray(), cameraPosition: internals.camera.position.toArray(),
        goalLag: internals.camera.position.distanceTo(goal) });
    }
    return { intervalMs, simulationDt, speed: kart.speed, start, unchanged, samples };
  },
};
(window as unknown as { __kartVisual: typeof api }).__kartVisual = api;
document.querySelector('#caption')!.textContent = mode === 'before'
  ? 'Avant · modèle procédural · caméra et éclairage fixes'
  : 'Après · modèle importé · caméra et éclairage fixes';
draw();
