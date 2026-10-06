import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nearestTrack, type Kart, type World } from '../shared/game';
import { getTrack, trackPoint, type TrackDefinition, type Vec2 } from '../shared/track';

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string | number, roughness = 0.85) {
  const key = `${color}:${roughness}`;
  let mat = materials.get(key);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness }); materials.set(key, mat); }
  return mat;
}
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
function mesh(geometry: THREE.BufferGeometry, color: string | number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  const object = new THREE.Mesh(geometry, material(color));
  object.position.set(x, y, z);
  object.scale.set(sx, sy, sz);
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}
function box(color: string | number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  return mesh(boxGeometry, color, x, y, z, sx, sy, sz);
}
function strip(points: Vec2[], width: number, offset = 0) {
  const TRACK = points;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= TRACK.length; i++) {
    const p = TRACK[i % TRACK.length];
    const before = TRACK[(i + TRACK.length - 1) % TRACK.length];
    const after = TRACK[(i + 1) % TRACK.length];
    const dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      const distance = side * width / 2 + offset;
      vertices.push(p.x + dz / length * distance, 0, p.z - dx / length * distance);
    }
    if (i < TRACK.length) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function label(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(12,36,43,.85)';
  ctx.beginPath(); ctx.roundRect(5, 5, 374, 70, 30); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 18), 192, 41, 345);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(5.5, 1.15, 1); sprite.position.y = 4.2;
  return sprite;
}

type KartVisual = { group: THREE.Group; body: THREE.Mesh; head: THREE.Mesh; sparks: THREE.Group; flames: THREE.Group; label: THREE.Sprite; name: string; color: string };

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly scenery = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
  private readonly karts = new Map<string, KartVisual>();
  private readonly pickups = new Map<string, THREE.Group>();
  private readonly objects = new Map<string, THREE.Group>();
  private readonly cameraAim = new THREE.Vector3();
  private readonly cameraGoal = new THREE.Vector3();
  private lastCameraId = '';
  private cameraAngle = 0;
  private readonly demo: KartVisual;
  private track: TrackDefinition = getTrack('lagon');
  private previewTrack = 'lagon';
  private bounds = { centerX: 0, centerZ: 0, radius: 140 };
  private readonly hemisphere = new THREE.HemisphereLight('#eaffed', '#586c55', 2.7);
  private readonly sun = new THREE.DirectionalLight('#fff0ce', 3.1);
  public frames = 0;
  public fps = 60;
  public quality: 'standard' | 'light' = 'standard';
  private fpsTime = performance.now();
  private slowSeconds = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.scene.background = new THREE.Color('#8edbdf');
    this.scene.fog = new THREE.Fog('#8edbdf', 200, 620);
    this.scene.add(this.hemisphere, this.scenery);
    const sun = this.sun;
    sun.position.set(-90, 150, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, far: 400 });
    sun.shadow.normalBias = 0.12;
    this.scene.add(sun);
    this.demo = this.buildKart('#ff7659', 'À vous la piste');
    this.demo.label.visible = false;
    this.scene.add(this.demo.group);
    this.setTrack('lagon', true);
    this.camera.position.set(80, 135, 160);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  setPreviewTrack(id: string) { this.previewTrack = getTrack(id).id; }

  private setTrack(id: string, force = false) {
    const next = getTrack(id);
    if (!force && next.id === this.track.id) return;
    const geometries = new Set<THREE.BufferGeometry>();
    this.scenery.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    this.scenery.clear();
    for (const geometry of geometries) if (geometry !== boxGeometry && geometry !== sphereGeometry) geometry.dispose();
    this.track = next;
    const minX = Math.min(...next.points.map(p => p.x)), maxX = Math.max(...next.points.map(p => p.x));
    const minZ = Math.min(...next.points.map(p => p.z)), maxZ = Math.max(...next.points.map(p => p.z));
    this.bounds = { centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2, radius: Math.max(maxX - minX, maxZ - minZ) / 2 + 39 };
    this.scene.background = new THREE.Color(next.palette.sky);
    this.scene.fog = new THREE.Fog(next.palette.sky, 200, 620);
    const night = next.theme === 'neon';
    this.hemisphere.color.set(night ? '#779bed' : '#eaffed');
    this.hemisphere.groundColor.set(night ? '#402150' : '#736854');
    this.hemisphere.intensity = night ? 1.5 : 2.7;
    this.sun.color.set(next.theme === 'ice' ? '#d3edff' : night ? '#bd82ff' : '#fff0ce');
    this.sun.intensity = night ? 1.5 : 3.1;
    this.buildIsland();
    this.batchScenery();
    const start = trackPoint(0, next.id);
    this.demo.group.position.set(start.x, 0.25, start.z);
    this.demo.group.rotation.y = start.angle;
    this.lastCameraId = '';
  }

  /** Static scenery shares one draw call per material, including the palm grove. */
  private batchScenery() {
    const batches = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geometries: THREE.BufferGeometry[] }>();
    const originals: THREE.Mesh[] = [];
    this.scene.updateMatrixWorld(true);
    this.scenery.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material)) return;
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material: object.material, cast: object.castShadow, receive: object.receiveShadow, geometries: [] }; batches.set(key, batch); }
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
      batch.geometries.push(geometry); originals.push(object);
    });
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries);
      if (geometry) { const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.cast; mesh.receiveShadow = batch.receive; this.scenery.add(mesh); }
      for (const part of batch.geometries) part.dispose();
    }
    const originalsGeometry = new Set(originals.map(object => object.geometry));
    for (const original of originals) original.removeFromParent();
    for (const geometry of originalsGeometry) if (geometry !== boxGeometry && geometry !== sphereGeometry) geometry.dispose();
  }

  private buildIsland() {
    const { centerX: cx, centerZ: cz, radius } = this.bounds;
    const track = this.track, points = track.points, width = track.width;
    const { palette, theme } = track;
    const scenery = this.scenery;
    if (theme === 'neon') for (const color of ['#69f1ee', '#f28fdf', '#7ddbeb', '#df82e0', '#74f5ef', '#dd80e4']) {
      const light = material(color); light.emissive.set(color); light.emissiveIntensity = 0.55;
    }
    const shore = theme === 'tropical' ? '#ecd5a1' : theme === 'canyon' ? '#d39564' : theme === 'ice' ? '#dfeff4' : '#252a54';
    const water = mesh(new THREE.PlaneGeometry(2000, 2000), palette.water, cx, -1.5, cz);
    water.rotation.x = -Math.PI / 2; water.receiveShadow = false; water.castShadow = false; scenery.add(water);
    const shallows = mesh(new THREE.CircleGeometry(radius + 19, 48), shore, cx, -1.35, cz, 1.12, 1, 1);
    shallows.rotation.x = -Math.PI / 2; scenery.add(shallows);
    scenery.add(mesh(new THREE.CylinderGeometry(radius, radius + 7, 4, 48), shore, cx, -2.2, cz, 1.05, 1, 1));
    const ground = mesh(new THREE.CircleGeometry(radius - 9, 48), palette.ground, cx, -0.12, cz, 1.07, 1, 1);
    ground.rotation.x = -Math.PI / 2; scenery.add(ground);
    const roadMat = material(palette.road), edgeMat = material(theme === 'neon' ? '#69f1ee' : '#efe9cf'), shoulderMat = material(shore);
    roadMat.side = edgeMat.side = shoulderMat.side = THREE.DoubleSide;
    const shoulder = new THREE.Mesh(strip(points, width + 10), shoulderMat); shoulder.position.y = 0.01; scenery.add(shoulder);
    const road = new THREE.Mesh(strip(points, width), roadMat); road.position.y = 0.05; road.receiveShadow = true; scenery.add(road);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(strip(points, 0.28, side * (width / 2 - 0.45)), edgeMat); edge.position.y = 0.07; scenery.add(edge);
    }
    const curbGeometry = new THREE.BoxGeometry(1, 0.18, 1);
    const curbs: { x: number; z: number; angle: number; length: number; color: number }[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const dx = q.x - p.x, dz = q.z - p.z, length = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
      const pieces = Math.ceil(length / 3);
      for (let j = 0; j < pieces; j++) for (const side of [-1, 1]) curbs.push({ x: p.x + dx * (j + 0.5) / pieces + Math.cos(angle) * side * (width / 2 + 0.5), z: p.z + dz * (j + 0.5) / pieces - Math.sin(angle) * side * (width / 2 + 0.5), angle, length: length / pieces, color: (i + j) % 2 });
    }
    const transform = new THREE.Object3D();
    const guardColor = theme === 'neon' ? '#69f1ee' : theme === 'ice' ? '#8abccb' : theme === 'canyon' ? '#966b50' : '#e7d9b6';
    const guardrail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.6, 1), material(guardColor), points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const angle = Math.atan2(b.x - a.x, b.z - a.z), length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex ? 1 : -1;
        transform.position.set((a.x + b.x) / 2 + Math.cos(angle) * side * (width / 2 + 5), 0.42, (a.z + b.z) / 2 - Math.sin(angle) * side * (width / 2 + 5));
        transform.rotation.set(0, angle, 0); transform.scale.set(1, 1, length + 0.07); transform.updateMatrix(); guardrail.setMatrixAt(i * 2 + sideIndex, transform.matrix);
      }
    }
    guardrail.receiveShadow = true; scenery.add(guardrail);
    for (const color of [0, 1]) {
      const subset = curbs.filter(c => c.color === color);
      const instances = new THREE.InstancedMesh(curbGeometry, material(color ? (theme === 'neon' ? '#538fad' : '#f3f0dc') : palette.accent), subset.length);
      subset.forEach((curb, i) => { transform.position.set(curb.x, 0.14, curb.z); transform.rotation.set(0, curb.angle, 0); transform.scale.set(1, 1, curb.length * 0.96); transform.updateMatrix(); instances.setMatrixAt(i, transform.matrix); });
      instances.receiveShadow = true; scenery.add(instances);
    }
    const start = trackPoint(0, track.id);
    const startGroup = new THREE.Group(); startGroup.position.set(start.x, 0.1, start.z); startGroup.rotation.y = start.angle;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) startGroup.add(box((i + j) % 2 ? '#213c43' : '#fff8e6', (i - 5.5) * width / 12, 0.01, j - 0.5, width / 12, 0.02, 1));
    startGroup.add(box(shore, -width / 2 - 2, 5, 0, 0.9, 10, 0.9), box(shore, width / 2 + 2, 5, 0, 0.9, 10, 0.9));
    startGroup.add(box(palette.accent, 0, 9.6, 0, width + 5, 1.5, 1.1));
    for (let i = -4; i <= 4; i++) startGroup.add(box(i % 2 ? '#ffffff' : '#18434a', i * 1.1, 9.6, -0.57, 1.1, 0.7, 0.02));
    scenery.add(startGroup);
    this.buildZones();

    let seed = 9183 + track.id.length * 371;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const leafGeometry = new THREE.ConeGeometry(2.1, 8, 4);
    const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.65, 9, 5);
    const pillarGeometry = new THREE.CylinderGeometry(1, 1.3, 1, 6);
    for (let i = 0; i < 82; i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * (radius - 13);
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (nearestTrack(x, z, track.id).distance < width / 2 + 8) continue;
      const prop = new THREE.Group(); prop.position.set(x, 0, z); prop.rotation.y = a;
      if (theme === 'tropical') {
        if (i % 4 === 0) prop.add(mesh(sphereGeometry, '#bac6a2', 0, 0.8, 0, 1.5 + random() * 2, 1 + random() * 2, 1.5 + random() * 2));
        else {
          prop.scale.setScalar(0.8 + random() * 0.6);
          const trunk = mesh(trunkGeometry, '#b7986b', 0.4, 4, 0); trunk.rotation.z = -0.09; prop.add(trunk);
          for (let j = 0; j < 6; j++) {
            const leaf = mesh(leafGeometry, j % 2 ? '#4f9470' : '#68a777', Math.sin(j * Math.PI / 3) * 2.3 + 0.8, 8.5, Math.cos(j * Math.PI / 3) * 2.3);
            leaf.rotation.set(Math.PI / 2.35, j * Math.PI / 3, 0, 'YXZ'); prop.add(leaf);
          }
          prop.add(mesh(sphereGeometry, '#c7894e', 0.6, 8.2, 0, 0.7, 0.7, 0.7));
        }
      } else if (theme === 'canyon') {
        if (i % 3 === 0) {
          const height = 7 + random() * 10;
          prop.add(mesh(pillarGeometry, '#b96947', 0, height / 2, 0, 3.5, height, 3.5));
          prop.add(mesh(pillarGeometry, '#d99b63', 0, height * 0.7, 0, 4.1, 1.7, 4.1));
          prop.add(mesh(pillarGeometry, '#e5ae73', 0, height + 0.8, 0, 3.1, 1.6, 3.1));
        } else {
          prop.add(box('#517d64', 0, 2.6, 0, 1, 5.2, 1), box('#628d65', 1.3, 2.6, 0, 2.6, 0.8, 0.8), box('#628d65', 2.3, 3.7, 0, 0.8, 2.8, 0.8));
          if (i % 2) prop.add(box('#739671', -1, 1.8, 0, 2, 0.7, 0.7), box('#739671', -1.7, 2.5, 0, 0.7, 2, 0.7));
        }
      } else if (theme === 'ice') {
        const height = 6 + random() * 13;
        if (i % 3 === 0) {
          prop.add(mesh(new THREE.ConeGeometry(5, height, 5), '#78b5cd', 0, height / 2, 0));
          prop.add(mesh(new THREE.ConeGeometry(2.6, height * 0.45, 5), '#f3fbff', 0, height * 0.79, 0));
        } else {
          for (let j = 0; j < 3; j++) {
            const crystal = mesh(new THREE.OctahedronGeometry(1, 0), j % 2 ? '#a7e8ee' : '#82bcd8', j * 1.2, 2 + j, 0, 1.5, 3 + j, 1.2); crystal.rotation.z = (j - 1) * 0.22; prop.add(crystal);
          }
        }
      } else {
        const height = 6 + random() * 23, size = 3 + random() * 4;
        prop.add(box(i % 2 ? '#253454' : '#34315c', 0, height / 2, 0, size, height, size));
        const lightColor = i % 2 ? '#69f1ee' : '#f28fdf';
        prop.add(box(lightColor, 0, height + 0.1, 0, size + 0.15, 0.2, size + 0.15));
        for (let floor = 2; floor < height - 1; floor += 3) prop.add(box(lightColor, 0, floor, size / 2 + 0.02, size * 0.68, 0.5, 0.04));
      }
      scenery.add(prop);
    }
    // Dispose unused helper geometry; merged scenery owns independent buffers.
    if (theme !== 'tropical') { leafGeometry.dispose(); trunkGeometry.dispose(); }
    if (theme !== 'canyon') pillarGeometry.dispose();
    for (let i = 0; i < 10; i++) {
      const point = trackPoint(i * track.length / 10, track.id), side = i % 2 ? -1 : 1;
      const x = point.x + Math.cos(point.angle) * side * (width / 2 + 9), z = point.z - Math.sin(point.angle) * side * (width / 2 + 9);
      const prop = new THREE.Group(); prop.position.set(x, 0, z); prop.rotation.y = point.angle;
      if (theme === 'tropical') {
        prop.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 4, 5), '#e5c797', 0, 2, 0));
        prop.add(mesh(new THREE.ConeGeometry(3.5, 1.3, 8), i % 2 ? '#ed845f' : '#ead491', 0, 4.5, 0));
        prop.add(box('#efe4bf', 1.5, 0.55, 0, 1.3, 0.4, 2.7));
      } else if (theme === 'neon') {
        prop.add(box('#303257', 0, 4, 0, 0.6, 8, 0.6), box('#74f5ef', -side * 2, 7.7, 0, 4.6, 0.35, 0.6));
        prop.add(box('#dd80e4', 0, 3.8, 0, 0.75, 2, 0.75));
      } else {
        prop.add(box(theme === 'ice' ? '#83b7c5' : '#9c674c', 0, 2, 0, 0.5, 4, 0.5));
        prop.add(box(palette.accent, 0, 3.8, 0, 3, 1.5, 0.25));
        const arrow = box('#fff6e2', 0, 3.8, -0.15, 1, 0.35, 0.04); arrow.rotation.z = side * 0.5; prop.add(arrow);
      }
      scenery.add(prop);
    }
    if (theme === 'tropical') for (let i = 0; i < 5; i++) {
      const a = i * 1.5 + 0.2, r = radius + 30 + i * 9;
      const boat = new THREE.Group(); boat.position.set(cx + Math.sin(a) * r, -0.8, cz + Math.cos(a) * r); boat.rotation.y = a;
      boat.add(mesh(sphereGeometry, '#fcf2d9', 0, 0, 0, 1.8, 0.6, 5), box('#886a58', 0, 4, 0, 0.15, 8, 0.15));
      boat.add(mesh(new THREE.ConeGeometry(3.5, 6.5, 3), i % 2 ? '#f59471' : '#fff4d5', 0, 4.5, 0, 0.06, 1, 1)); scenery.add(boat);
    }
    if (theme === 'neon') for (const fraction of [0.18, 0.5, 0.77]) {
      const point = trackPoint(track.length * fraction, track.id);
      const arch = new THREE.Group(); arch.position.set(point.x, 0, point.z); arch.rotation.y = point.angle;
      for (const side of [-1, 1]) arch.add(box('#7ddbeb', side * (width / 2 + 2), 6, 0, 0.35, 12, 0.35));
      arch.add(box('#df82e0', 0, 12, 0, width + 4, 0.35, 0.35)); scenery.add(arch);
    }
  }

  private buildZones() {
    for (const zone of this.track.zones) {
      const vertices: number[] = [], indices: number[] = [];
      const pieces = Math.max(2, Math.ceil((zone.end - zone.start) / 2));
      for (let i = 0; i <= pieces; i++) {
        const point = trackPoint(zone.start + (zone.end - zone.start) * i / pieces, this.track.id);
        for (const side of [-1, 1]) {
          const offset = zone.offset + side * zone.width / 2;
          vertices.push(point.x + Math.cos(point.angle) * offset, 0.085, point.z - Math.sin(point.angle) * offset);
        }
        if (i < pieces) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const color = zone.kind === 'boost' ? '#efc457' : zone.kind === 'ice' ? '#b5eaf1' : '#745449';
      const mat = material(color, zone.kind === 'ice' ? 0.15 : 0.85); mat.side = THREE.DoubleSide;
      const patch = new THREE.Mesh(geometry, mat); patch.receiveShadow = true; this.scenery.add(patch);
      if (zone.kind === 'boost') for (let progress = zone.start + 2; progress < zone.end - 1; progress += 3) {
        const point = trackPoint(progress, this.track.id);
        const arrow = new THREE.Group(); arrow.position.set(point.x + Math.cos(point.angle) * zone.offset, 0.13, point.z - Math.sin(point.angle) * zone.offset); arrow.rotation.y = point.angle;
        for (const side of [-1, 1]) { const line = box('#fff6d2', side * 0.65, 0, 0, 0.35, 0.035, 1.8); line.rotation.y = -side * 0.6; arrow.add(line); }
        this.scenery.add(arrow);
      }
    }
  }

  private buildKart(color: string, name: string): KartVisual {
    const group = new THREE.Group();
    const body = box(color, 0, 0.75, 0, 1.9, 0.65, 3.1); group.add(body);
    group.add(box('#f4eacb', 0, 0.5, 1.55, 2.1, 0.35, 0.4), box('#173a43', 0, 0.6, -1.5, 2.2, 0.3, 0.35));
    group.add(box(color, 0, 1.1, -1.55, 2.4, 0.18, 0.65), box('#f8ebd3', 0, 1.08, 0.7, 0.35, 0.04, 1.3));
    const wheelGeometry = new THREE.CylinderGeometry(0.53, 0.53, 0.42, 10);
    for (const x of [-1.05, 1.05]) for (const z of [-1, 1]) {
      const wheel = mesh(wheelGeometry, '#1e3037', x, 0.48, z); wheel.rotation.z = Math.PI / 2; group.add(wheel);
      const hub = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.45, 8), '#d3ded6', x, 0.48, z); hub.rotation.z = Math.PI / 2; group.add(hub);
    }
    group.add(mesh(sphereGeometry, color, 0, 1.4, -0.25, 0.6, 0.65, 0.5));
    const head = mesh(sphereGeometry, '#fff1db', 0, 2.13, -0.15, 0.61, 0.59, 0.6); group.add(head);
    group.add(box('#19404b', 0, 2.17, 0.35, 0.83, 0.25, 0.22));
    const sparks = new THREE.Group();
    for (const x of [-1.1, 1.1]) for (let i = 0; i < 3; i++) sparks.add(mesh(new THREE.OctahedronGeometry(0.16), '#72eaff', x + (i % 2) * 0.13, 0.35 + i * 0.1, -1.5 - i * 0.45, 1, 1, 2));
    group.add(sparks); sparks.visible = false;
    const flames = new THREE.Group();
    for (const x of [-0.65, 0.65]) { const flame = mesh(new THREE.ConeGeometry(0.4, 2.6, 5), '#ffcf63', x, 0.65, -2.2); flame.rotation.x = -Math.PI / 2; flames.add(flame); }
    group.add(flames); flames.visible = false;
    const nameLabel = label(name); group.add(nameLabel);
    return { group, body, head, sparks, flames, label: nameLabel, name, color };
  }

  render(world: World | null, players: Kart[], localId: string, dt: number, now: number) {
    this.setTrack(world?.trackId ?? this.previewTrack);
    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = this.frames * 1000 / (now - this.fpsTime); this.frames = 0; this.fpsTime = now;
      this.slowSeconds = this.fps < 20 ? this.slowSeconds + 1 : 0;
      if (this.slowSeconds >= 3 && this.quality === 'standard') {
        this.quality = 'light';
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 0.8));
        this.renderer.shadowMap.enabled = false;
        for (const material of materials.values()) material.needsUpdate = true;
        this.resize();
      }
    }
    const ids = new Set(players.map(p => p.id));
    for (const [id, visual] of this.karts) if (!ids.has(id)) { this.scene.remove(visual.group); visual.label.material.map?.dispose(); visual.label.material.dispose(); this.karts.delete(id); }
    this.demo.group.visible = !world;
    for (const kart of players) {
      let visual = this.karts.get(kart.id);
      if (!visual) { visual = this.buildKart(kart.color, kart.name); this.karts.set(kart.id, visual); this.scene.add(visual.group); }
      if (visual.color !== kart.color) { visual.body.material = material(kart.color); visual.color = kart.color; }
      if (visual.name !== kart.name) { visual.group.remove(visual.label); visual.label.material.map?.dispose(); visual.label.material.dispose(); visual.label = label(kart.name); visual.group.add(visual.label); visual.name = kart.name; }
      visual.group.visible = !kart.spectator && !kart.abandoned;
      visual.group.position.set(kart.x, 0.15 + (kart.stun > 0 ? Math.sin(now * 0.025) * 0.16 : 0), kart.z);
      visual.group.rotation.set(0, kart.angle, kart.driftCharge > 0.1 ? Math.sin(now * 0.02) * 0.025 : 0);
      visual.label.visible = kart.id !== localId;
      visual.sparks.visible = kart.driftCharge > 0.1; visual.sparks.scale.setScalar(0.8 + (Math.sin(now * 0.08) + 1) * 0.4);
      visual.flames.visible = kart.boost > 0; visual.flames.scale.z = 0.85 + Math.sin(now * 0.1) * 0.2;
      visual.head.rotation.z = kart.stun > 0 ? Math.sin(now * 0.015) * 0.5 : 0;
    }
    this.renderObjects(world, now);
    const local = players.find(k => k.id === localId && !k.spectator) ?? (world && world.phase !== 'lobby' ? players.find(k => !k.spectator) : undefined);
    const following = local && world && world.phase !== 'lobby' && world.phase !== 'finished';
    if (following) {
      const blend = 1 - Math.exp(-dt * 5);
      if (this.lastCameraId !== local.id) { this.cameraAngle = local.angle; this.cameraAim.set(local.x, 1, local.z); }
      this.cameraAngle += Math.atan2(Math.sin(local.angle - this.cameraAngle), Math.cos(local.angle - this.cameraAngle)) * (1 - Math.exp(-dt * 4));
      const distance = 14 + Math.min(3, Math.abs(local.speed) / 12);
      this.cameraGoal.set(local.x - Math.sin(this.cameraAngle) * distance, 9, local.z - Math.cos(this.cameraAngle) * distance);
      this.camera.position.lerp(this.cameraGoal, this.lastCameraId === local.id ? blend : 1);
      this.cameraAim.lerp(new THREE.Vector3(local.x + Math.sin(this.cameraAngle) * 7, 1.2, local.z + Math.cos(this.cameraAngle) * 7), blend);
      this.camera.lookAt(this.cameraAim); this.lastCameraId = local.id;
      const fov = local.boost > 0 ? 62 : 55; this.camera.fov += (fov - this.camera.fov) * blend; this.camera.updateProjectionMatrix();
    } else {
      const { centerX: x, centerZ: z, radius } = this.bounds;
      const angle = now * 0.000018 + 0.55;
      this.cameraGoal.set(x + Math.sin(angle) * radius * 1.05, radius * 1.25, z + Math.cos(angle) * radius * 1.25);
      this.camera.position.lerp(this.cameraGoal, 1 - Math.exp(-dt * 2));
      // Frame the island to the right of the home panel on desktop.
      this.cameraAim.lerp(new THREE.Vector3(x - (innerWidth > 900 ? radius * 0.29 : 0), 0, z), 1 - Math.exp(-dt * 2));
      this.camera.lookAt(this.cameraAim); this.camera.fov += (52 - this.camera.fov) * Math.min(1, dt * 3); this.camera.updateProjectionMatrix(); this.lastCameraId = '';
    }
    this.renderer.render(this.scene, this.camera);
  }

  private renderObjects(world: World | null, now: number) {
    const pickups = world?.pickups ?? [];
    for (const pickup of pickups) {
      let visual = this.pickups.get(pickup.id);
      if (!visual) {
        visual = new THREE.Group();
        const cube = box('#a5ffe9', 0, 0, 0, 1.7, 1.7, 1.7); (cube.material as THREE.MeshStandardMaterial) = material('#8ce8d0', 0.2);
        visual.add(cube, box('#fff9ca', 0, 0, 0.88, 0.3, 1, 0.05), box('#fff9ca', 0, 0, -0.88, 0.3, 1, 0.05));
        this.pickups.set(pickup.id, visual); this.scene.add(visual);
      }
      visual.visible = pickup.cooldown <= 0; visual.position.set(pickup.x, 1.6 + Math.sin(now * 0.003 + pickup.x) * 0.25, pickup.z); visual.rotation.set(0.15, now * 0.0009, 0.15);
    }
    const pickupIds = new Set(pickups.map(p => p.id));
    for (const [id, visual] of this.pickups) if (!pickupIds.has(id)) { this.scene.remove(visual); this.pickups.delete(id); }
    const ids = new Set((world?.objects ?? []).map(o => o.id));
    for (const [id, visual] of this.objects) if (!ids.has(id)) { this.scene.remove(visual); this.objects.delete(id); }
    for (const object of world?.objects ?? []) {
      let visual = this.objects.get(object.id);
      if (!visual) {
        visual = new THREE.Group();
        if (object.kind === 'trap') {
          visual.add(mesh(new THREE.ConeGeometry(1.1, 1.6, 5), '#ffbf47', 0, 0.7, 0), mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.15, 8), '#ee704a', 0, 0.15, 0));
        } else visual.add(mesh(sphereGeometry, '#ef805f', 0, 0.85, 0, 0.85, 0.85, 1.2), box('#fff0cc', 0, 0.85, 0, 1.8, 0.15, 0.3));
        this.objects.set(object.id, visual); this.scene.add(visual);
      }
      visual.position.set(object.x, 0, object.z); visual.rotation.y = object.angle;
    }
  }
}
