import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nearestTrack, type Kart, type World } from '../shared/game';
import { getTrack, trackPoint, trackElevation, trackSlope, type TrackDefinition, type Vec2 } from '../shared/track';
import { createKartContactShadow, createKartModel, kartAssetDiagnostics, type KartModelInstance } from './kart-model';
import { DEFAULT_CHARACTER, normalizeCharacterId, type CharacterId } from '../shared/characters';
import { DEFAULT_KART_MODEL, normalizeKartModelId, type KartModelId } from '../shared/kart-catalog';
import { nearestDriveableTrack, getTrackEvent, trackBoundaryGap } from '../shared/track-events';
import { TrackEventsView } from './track-events';
import { trackZoneGeometry } from './track-zone-geometry';
import { loopMeshRows, roadMeshRows } from './track-mesh-sampling';
import { GhostView } from './ghost-view';
import { CrownView } from './crown-view';
import { buildTrackExtras, hasExtraScenery } from './scenery-extras';
import { buildTrackTerrain } from './scenery-terrain';
import { preloadSceneryAssets, sceneryAssetDiagnostics } from './scenery-assets';
import { trackLoopAt, trackLoopPose, kartLoopPose, kartLoopRoadPosition } from '../shared/track-loop';
import { buildLoopStructures, applyLoopOrientation } from './track-loops';
import { ROAD_RAIL_HEIGHT, ROAD_RAIL_CENTER_Y, isBridgeProgress, trackBoundaryShoulder, driveableGroundHeight } from '../shared/obstacle-heights';
import type { GhostData } from '../shared/progression';
import { GRAPHICS_STORAGE_KEY, graphicsMode, GraphicsPolicy, RenderPacer, type GraphicsMode, type RenderContext } from './graphics-policy';
import { reduceSceneryDetails } from './graphics-scenery';
import { buildCrossingStructures, crossingCameraHeight } from './track-crossings';

const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string | number, roughness = 0.85) {
  const key = `${color}:${roughness}`;
  let mat = materials.get(key);
  if (!mat) { mat = new THREE.MeshStandardMaterial({ color, roughness }); materials.set(key, mat); }
  return mat;
}
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const sphereGeometry = new THREE.IcosahedronGeometry(1, 1);
const sparkGeometry = new THREE.OctahedronGeometry(0.16);
const flameGeometry = new THREE.ConeGeometry(0.32, 2.1, 5);
const trapGeometry = new THREE.ConeGeometry(1.1, 1.6, 5);
const objectBaseGeometry = new THREE.CylinderGeometry(1.4, 1.4, 0.15, 8);
const rocketGeometry = new THREE.ConeGeometry(0.6, 1.8, 6);
const shieldGeometry = new THREE.SphereGeometry(1, 12, 8);
const auraGeometry = new THREE.TorusGeometry(1.8, 0.07, 4, 24);
const auraMaterial = new THREE.MeshBasicMaterial({ color: '#ffe67c', transparent: true, opacity: 0.8, depthWrite: false });
const shieldMaterial = new THREE.MeshBasicMaterial({ color: '#66ddff', transparent: true, opacity: 0.13, depthWrite: false });
const shieldRimMaterial = new THREE.MeshBasicMaterial({ color: '#8beeff', transparent: true, opacity: 0.7, depthWrite: false });
const starShape = new THREE.Shape();
for (let i = 0; i <= 10; i++) {
  const radius = i % 2 ? 0.24 : 0.55;
  const angle = Math.PI / 2 + i * Math.PI / 5;
  if (i === 0) starShape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  else starShape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
}
const starGeometry = new THREE.ExtrudeGeometry(starShape, { depth: 0.12, bevelEnabled: false });
let mysteryMaterial: THREE.SpriteMaterial | undefined;
function mysteryBadge() {
  if (!mysteryMaterial) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 58px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff9ca'; ctx.strokeStyle = '#1c736f'; ctx.lineWidth = 5;
    ctx.strokeText('?', 32, 33); ctx.fillText('?', 32, 33);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    mysteryMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: true });
  }
  const sprite = new THREE.Sprite(mysteryMaterial); sprite.position.y = 1.45; sprite.scale.setScalar(1.4); return sprite;
}
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
function strip(points: Vec2[], width: number, offset = 0, trackId = 'lagon', height = 0) {
  const track = getTrack(trackId);
  // Include both sides of each ramp lip so its visible end matches the launch.
  const samples = track.elevations.length || track.loops.length || track.crossings?.length ? [...new Set([
    ...Array.from({ length: roadMeshRows(track.length) }, (_, i) => i * track.length / roadMeshRows(track.length)),
    ...track.elevations.flatMap(feature => [feature.start, feature.end, feature.end + .05]),
    ...(track.crossings ?? []).flatMap(c => [c.lowerStart, c.lowerEnd, c.upperStart - c.approach, c.upperStart, c.upperEnd, c.upperEnd + c.approach])
      .map(progress => (progress % track.length + track.length) % track.length),
    ...track.loops.flatMap(loop => { const count = loopMeshRows(loop); return Array.from({ length: count + 1 }, (_, i) => loop.start + (loop.end - loop.start) * i / count); }),
  ])].sort((a, b) => a - b) : [];
  const TRACK = samples.length ? samples.map(progress => trackPoint(progress, trackId)) : points;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= TRACK.length; i++) {
    const p = TRACK[i % TRACK.length];
    const before = TRACK[(i + TRACK.length - 1) % TRACK.length];
    const after = TRACK[(i + 1) % TRACK.length];
    const dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      const progress = samples[i % TRACK.length] ?? nearestTrack(p.x, p.z, trackId).progress;
      const localWidth = width === track.width + 10 ? track.width + trackBoundaryShoulder(progress, trackId) * 2 : width;
      const distance = side * localWidth / 2 + offset;
      const loop = trackLoopPose(progress, trackId, distance);
      if (loop.active) vertices.push(loop.x + loop.up.x * height, loop.y + loop.up.y * height, loop.z + loop.up.z * height);
      else vertices.push(p.x + dz / length * distance, trackElevation(progress, trackId) + height, p.z - dx / length * distance);
    }
    if (i < TRACK.length) {
      const from = samples[i] ?? nearestTrack(p.x, p.z, trackId).progress;
      const to = i + 1 < TRACK.length ? samples[i + 1] ?? nearestTrack(TRACK[i + 1].x, TRACK[i + 1].z, trackId).progress : track.length;
      // The folded portion owns one subdivided surface in buildLoopStructures.
      // Wide overlapping shoulder/road quads otherwise intersect when twisted.
      if (trackLoopAt((from + to) / 2, trackId)) continue;
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
  sprite.scale.set(4.4, 0.92, 1); sprite.position.y = 2.6;
  return sprite;
}

type KartVisual = { group: THREE.Group; model: KartModelInstance | null; modelId: KartModelId; characterId: CharacterId; modelVersion: number; alive: boolean; sparks: THREE.Group; flames: THREE.Group; energy: THREE.Group; shield: THREE.Group; label: THREE.Sprite; name: string; color: string };

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly trackEvents = new TrackEventsView(this.scene);
  private readonly ghost = new GhostView(this.scene);
  private readonly crown = new CrownView(this.scene);
  private readonly scenery = new THREE.Group();
  // Keep nearby karts visible; the distant panorama uses a larger near plane
  // below so road ribbons a centimetre apart retain distinct depth values.
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 1, 900);
  private readonly karts = new Map<string, KartVisual>();
  private readonly pickups = new Map<string, THREE.Group>();
  private readonly objects = new Map<string, THREE.Group>();
  private readonly cameraAim = new THREE.Vector3();
  private readonly cameraGoal = new THREE.Vector3();
  private lastCameraId = '';
  private lastCameraFrame: number | null = null;
  private cameraAngle = 0;
  private compactViewport = false;
  private readonly demo: KartVisual;
  private track: TrackDefinition = getTrack('lagon');
  private previewTrack = 'lagon';
  private eventStage = 0;
  private eventLevel = 3;
  private bounds = { centerX: 0, centerZ: 0, radius: 140 };
  private readonly hemisphere = new THREE.HemisphereLight('#eaffed', '#586c55', 2.7);
  private readonly sun = new THREE.DirectionalLight('#fff0ce', 3.1);
  public frames = 0;
  public fps = 60;
  public quality: 'standard' | 'light' = 'standard';
  private fpsTime = performance.now();
  private readonly graphics = new GraphicsPolicy();
  private readonly pacer = new RenderPacer();
  private renderedFrames = 0;
  private renderState: 'race' | 'menu' | 'hidden' | 'dialog' = 'menu';
  private sceneryDetails = { optional: 0, visible: 0 };

  get kartAssets() { return kartAssetDiagnostics(); }
  get sceneryAssets() { return sceneryAssetDiagnostics(); }
  get qualityMode() { return this.graphics.mode; }
  get viewDiagnostics() {
    const tracked = this.karts.get(this.lastCameraId)?.group;
    const point = tracked?.getWorldPosition(new THREE.Vector3());
    const normal = tracked ? new THREE.Vector3(0, 1, 0).applyQuaternion(tracked.quaternion) : null;
    const projected = point?.clone().addScaledVector(normal!, 1).project(this.camera);
    return { camera: { position: this.camera.position.toArray(), target: this.cameraAim.toArray(), up: this.camera.up.toArray(), fov: this.camera.fov, near: this.camera.near },
      tracked: point ? { id: this.lastCameraId, position: point.toArray(), up: normal!.toArray(), projected: projected!.toArray() } : null,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, compact: this.compactViewport,
      qualityMode: this.qualityMode, quality: this.quality, pixelRatio: this.renderer.getPixelRatio(),
      shadows: this.renderer.shadowMap.enabled, sceneryDetails: { ...this.sceneryDetails },
      renderedFrames: this.renderedFrames, renderState: this.renderState, menuFpsLimit: this.pacer.menuFps };
  }

  constructor(canvas: HTMLCanvasElement) {
    try { this.graphics.setMode(graphicsMode(localStorage.getItem(GRAPHICS_STORAGE_KEY))); } catch { /* Optional local preference. */ }
    this.quality = this.graphics.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.graphics.pixelRatio(devicePixelRatio));
    this.renderer.shadowMap.enabled = this.quality === 'standard';
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
    void preloadSceneryAssets().then(() => this.setTrack(this.track.id, true));
  }

  private resize() {
    this.compactViewport = matchMedia('(pointer: coarse)').matches || innerWidth <= 760;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.pacer.invalidate();
  }

  setQualityMode(mode: GraphicsMode) {
    this.graphics.setMode(mode); this.applyQuality(); this.pacer.invalidate();
  }

  private applyQuality() {
    const changed = this.quality !== this.graphics.quality;
    this.quality = this.graphics.quality;
    this.renderer.setPixelRatio(this.graphics.pixelRatio(devicePixelRatio));
    this.renderer.shadowMap.enabled = this.quality === 'standard';
    if (changed) {
      // Rebuild only for a real detail change, keeping road/collision markers.
      this.setTrack(this.track.id, true);
      this.scene.traverse(object => {
        if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
      });
    }
    this.resize();
  }

  setPreviewTrack(id: string) { this.previewTrack = getTrack(id).id; }
  setGhost(ghost: GhostData | null) { this.ghost.set(ghost); }

  setPreviewKart(color: string, modelId: string, characterId: string = DEFAULT_CHARACTER) {
    this.demo.color = color; this.demo.model?.setColor(color);
    if (this.demo.modelId !== normalizeKartModelId(modelId) || this.demo.characterId !== normalizeCharacterId(characterId)) this.setKartModel(this.demo, modelId, characterId);
  }

  private setTrack(id: string, force = false) {
    const next = getTrack(id);
    const trackChanged = next.id !== this.track.id;
    if (!force && next.id === this.track.id) return;
    const geometries = new Set<THREE.BufferGeometry>();
    this.scenery.traverse(object => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
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
    this.sceneryDetails = this.quality === 'light' ? reduceSceneryDetails(this.scenery) : { optional: 0, visible: 0 };
    this.batchScenery();
    const start = trackPoint(0, next.id);
    this.demo.group.position.set(start.x, trackElevation(0, next.id) + 0.055, start.z);
    this.demo.group.rotation.y = start.angle;
    if (trackChanged) this.lastCameraId = '';
  }

  /** Static scenery shares one draw call per material, including the palm grove. */
  private batchScenery() {
    const batches = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geometries: THREE.BufferGeometry[] }>();
    const originals: THREE.Mesh[] = [];
    this.scene.updateMatrixWorld(true);
    this.scenery.traverseVisible(object => {
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
    const shore = hasExtraScenery(track) ? palette.ground : theme === 'tropical' ? '#ecd5a1' : theme === 'canyon' ? '#d39564' : theme === 'ice' ? '#dfeff4' : '#252a54';
    const water = mesh(new THREE.PlaneGeometry(2000, 2000), palette.water, cx, -1.5, cz);
    water.rotation.x = -Math.PI / 2; water.receiveShadow = false; water.castShadow = false; scenery.add(water);
    scenery.add(buildTrackTerrain(track));
    const roadMat = material(palette.road), edgeMat = material(theme === 'neon' ? '#69f1ee' : '#efe9cf'), shoulderMat = material(shore);
    roadMat.side = edgeMat.side = shoulderMat.side = THREE.DoubleSide;
    const shoulder = new THREE.Mesh(strip(points, width + 10, 0, track.id, .01), shoulderMat); scenery.add(shoulder);
    const road = new THREE.Mesh(strip(points, width, 0, track.id, .05), roadMat); road.receiveShadow = true; scenery.add(road);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(strip(points, 0.28, side * (width / 2 - 0.45), track.id, .07), edgeMat); scenery.add(edge);
    }
    const curbGeometry = new THREE.BoxGeometry(1, 0.18, 1);
    const curbs: { x: number; z: number; angle: number; length: number; color: number; progress: number }[] = [];
    const roadProgress: number[] = []; let arc = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const dx = q.x - p.x, dz = q.z - p.z, length = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
      roadProgress.push(arc);
      const pieces = Math.ceil(length / 3);
      for (let j = 0; j < pieces; j++) for (const side of [-1, 1]) curbs.push({ x: p.x + dx * (j + 0.5) / pieces + Math.cos(angle) * side * (width / 2 + 0.5), z: p.z + dz * (j + 0.5) / pieces - Math.sin(angle) * side * (width / 2 + 0.5), angle, length: length / pieces, color: (i + j) % 2, progress: arc + length * (j + .5) / pieces });
      arc += length;
    }
    const transform = new THREE.Object3D();
    const guardColor = theme === 'neon' ? '#69f1ee' : theme === 'ice' ? '#8abccb' : theme === 'canyon' ? '#966b50' : '#e7d9b6';
    const guardrail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, ROAD_RAIL_HEIGHT, 1), material(guardColor), points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const angle = Math.atan2(b.x - a.x, b.z - a.z), length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const side = sideIndex ? 1 : -1;
        transform.position.set((a.x + b.x) / 2 + Math.cos(angle) * side * (width / 2 + 5), ROAD_RAIL_CENTER_Y, (a.z + b.z) / 2 - Math.sin(angle) * side * (width / 2 + 5));
        const progress = roadProgress[i]! + length / 2;
        const gap = !!trackLoopAt(progress, track.id) || isBridgeProgress(progress, track.id) || trackBoundaryGap(transform.position.x, transform.position.z, track.id, this.eventStage, this.eventLevel);
        transform.position.y += trackElevation(progress, track.id);
        transform.rotation.set(-Math.atan(trackSlope(progress, track.id)), angle, 0, 'YXZ'); transform.scale.set(gap ? 0 : 1, gap ? 0 : 1, gap ? 0 : length + 0.07); transform.updateMatrix(); guardrail.setMatrixAt(i * 2 + sideIndex, transform.matrix);
      }
    }
    guardrail.receiveShadow = true; scenery.add(guardrail);
    for (const color of [0, 1]) {
      const subset = curbs.filter(c => c.color === color && !trackLoopAt(c.progress, track.id));
      const instances = new THREE.InstancedMesh(curbGeometry, material(color ? (theme === 'neon' ? '#538fad' : '#f3f0dc') : palette.accent), subset.length);
      subset.forEach((curb, i) => { const progress = curb.progress; transform.position.set(curb.x, 0.14 + trackElevation(progress, track.id), curb.z); transform.rotation.set(-Math.atan(trackSlope(progress, track.id)), curb.angle, 0, 'YXZ'); transform.scale.set(1, 1, curb.length * 0.96); transform.updateMatrix(); instances.setMatrixAt(i, transform.matrix); });
      instances.receiveShadow = true; scenery.add(instances);
    }
    const start = trackPoint(0, track.id);
    const startGroup = new THREE.Group(); startGroup.position.set(start.x, trackElevation(0, track.id) + 0.1, start.z); startGroup.rotation.y = start.angle;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) startGroup.add(box((i + j) % 2 ? '#213c43' : '#fff8e6', (i - 5.5) * width / 12, 0.01, j - 0.5, width / 12, 0.02, 1));
    startGroup.add(box(shore, -width / 2 - 2, 5, 0, 0.9, 10, 0.9), box(shore, width / 2 + 2, 5, 0, 0.9, 10, 0.9));
    startGroup.add(box(palette.accent, 0, 9.6, 0, width + 5, 1.5, 1.1));
    for (let i = -4; i <= 4; i++) startGroup.add(box(i % 2 ? '#ffffff' : '#18434a', i * 1.1, 9.6, -0.57, 1.1, 0.7, 0.02));
    scenery.add(startGroup);
    this.buildZones();
    scenery.add(buildTrackExtras(track, this.eventStage, this.eventLevel));
    scenery.add(buildCrossingStructures(track));
    scenery.add(buildLoopStructures(track));

    let seed = 9183 + track.id.length * 371;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const leafGeometry = new THREE.ConeGeometry(2.1, 8, 4);
    const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.65, 9, 5);
    const pillarGeometry = new THREE.CylinderGeometry(1, 1.3, 1, 6);
    for (let i = 0; i < (hasExtraScenery(track) ? 0 : 82); i++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * (radius - 13);
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const route = nearestDriveableTrack(x, z, track.id, 2, 3);
      if (route.distance < route.width / 2 + 8) continue;
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
    for (let i = 0; i < (hasExtraScenery(track) ? 0 : 10); i++) {
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
    let overlayOrder = 1;
    for (const zone of [...this.track.zones].reverse()) {
      const geometry = trackZoneGeometry(this.track.id, zone);
      const color = zone.kind === 'boost' ? '#efc457' : zone.kind === 'ice' ? '#b5eaf1' : '#745449';
      const mat = material(color, zone.kind === 'ice' ? 0.15 : 0.85); mat.side = THREE.DoubleSide;
      const patch = new THREE.Mesh(geometry, mat); patch.receiveShadow = true; patch.renderOrder = overlayOrder++; this.scenery.add(patch);
      if (zone.kind === 'boost') for (let progress = zone.start + 2; progress < zone.end - 1; progress += 3) {
        const pose = trackLoopPose(progress, this.track.id, zone.offset);
        const arrow = new THREE.Group(); arrow.position.set(pose.x + pose.up.x * .13, pose.y + pose.up.y * .13, pose.z + pose.up.z * .13); applyLoopOrientation(arrow, pose);
        for (const side of [-1, 1]) { const line = box('#fff6d2', side * 0.65, 0, 0, 0.35, 0.035, 1.8); line.rotation.y = -side * 0.6; arrow.add(line); }
        this.scenery.add(arrow);
      }
    }
  }

  private buildKart(color: string, name: string, modelId: string = DEFAULT_KART_MODEL, characterId: string = DEFAULT_CHARACTER): KartVisual {
    const group = new THREE.Group();
    group.userData.role = 'kart-instance';
    group.add(createKartContactShadow());
    const sparks = new THREE.Group();
    for (const x of [-1.1, 1.1]) for (let i = 0; i < 3; i++) sparks.add(mesh(sparkGeometry, '#72eaff', x + (i % 2) * 0.13, 0.3 + i * 0.1, -1.5 - i * 0.45, 1, 1, 2));
    group.add(sparks); sparks.visible = false;
    const flames = new THREE.Group();
    for (const x of [-0.48, 0.48]) { const flame = mesh(flameGeometry, '#ffcf63', x, 0.42, -2.25); flame.rotation.x = -Math.PI / 2; flames.add(flame); }
    group.add(flames); flames.visible = false;
    // Effects have their own materials; shared imported kart materials are never
    // recoloured or made transparent by another player's temporary protection.
    const energy = new THREE.Group();
    const ring = new THREE.Mesh(auraGeometry, auraMaterial); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25;
    energy.add(ring);
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(starGeometry, auraMaterial);
      star.position.set(Math.sin(i * Math.PI * 2 / 3) * 1.65, 1.5, Math.cos(i * Math.PI * 2 / 3) * 1.65);
      star.scale.setScalar(0.7); energy.add(star);
    }
    energy.visible = false; group.add(energy);
    const shield = new THREE.Group();
    const bubble = new THREE.Mesh(shieldGeometry, shieldMaterial); bubble.position.y = 1; bubble.scale.set(1.6, 1.5, 2.4);
    const rim = new THREE.Mesh(auraGeometry, shieldRimMaterial); rim.rotation.x = Math.PI / 2; rim.scale.set(0.85, 1.3, 1); rim.position.y = 0.35;
    shield.add(bubble, rim); shield.visible = false; group.add(shield);
    const nameLabel = label(name); group.add(nameLabel);
    const visual: KartVisual = { group, model: null, modelId: normalizeKartModelId(modelId), characterId: normalizeCharacterId(characterId), modelVersion: 0, alive: true, sparks, flames, energy, shield, label: nameLabel, name, color };
    this.setKartModel(visual, modelId, characterId);
    return visual;
  }

  private setKartModel(visual: KartVisual, modelId: string, characterId: string = DEFAULT_CHARACTER) {
    visual.modelId = normalizeKartModelId(modelId); visual.characterId = normalizeCharacterId(characterId);
    const version = ++visual.modelVersion;
    void createKartModel(visual.color, visual.modelId, visual.characterId).then(model => {
      // A selection can change again while its GLB is loading. Retain only the latest request.
      if (!visual.alive || visual.modelVersion !== version) { model.dispose(); return; }
      visual.model?.dispose(); model.setColor(visual.color);
      visual.model = model; visual.group.add(model.group);
    });
  }

  private removeKart(visual: KartVisual) {
    visual.alive = false;
    visual.group.removeFromParent(); visual.model?.dispose();
    visual.label.material.map?.dispose(); visual.label.material.dispose();
  }

  render(world: World | null, players: Kart[], localId: string, dt: number, now: number, context: RenderContext = {}) {
    const racing = world?.phase === 'racing' || world?.phase === 'countdown';
    const hidden = context.hidden ?? document.hidden;
    this.renderState = hidden ? 'hidden' : context.opaqueDialog ? 'dialog' : racing ? 'race' : 'menu';
    if (!this.pacer.shouldRender(now, racing, { ...context, hidden })) {
      if (hidden || context.opaqueDialog) { this.frames = 0; this.fpsTime = now; this.lastCameraFrame = null; this.lastCameraId = ''; this.graphics.observeFps(0, false); }
      return false;
    }
    if (!racing) this.graphics.observeFps(0, false);
    // Simulation dt is capped by the caller. Camera smoothing must follow the
    // actual frame interval, otherwise slow rendering leaves it behind the kart.
    const cameraElapsed = this.lastCameraFrame === null ? dt : (now - this.lastCameraFrame) / 1000;
    const cameraDt = Math.max(0, Math.min(0.5, cameraElapsed));
    this.lastCameraFrame = now;
    // Re-anchor after an inactive tab instead of sweeping across an old position.
    if (cameraElapsed > 0.5) { this.lastCameraId = ''; this.frames = 0; this.fpsTime = now; }
    const eventStage = world?.eventStage ?? 0, eventLevel = world?.eventLevel ?? 3;
    const openingsChanged = eventStage !== this.eventStage || eventLevel !== this.eventLevel;
    this.eventStage = eventStage; this.eventLevel = eventLevel;
    // Rebuild the static rail openings only at a phase change, preserving the camera.
    this.setTrack(world?.trackId ?? this.previewTrack, openingsChanged);
    this.trackEvents.update(world?.trackId ?? this.previewTrack, world?.eventStage ?? 0, world?.eventLevel ?? 3, world?.time ?? now / 1000, world?.interactions);
    this.ghost.update(world);
    this.frames++;
    if (now - this.fpsTime >= 1000) {
      this.fps = this.frames * 1000 / (now - this.fpsTime); this.frames = 0; this.fpsTime = now;
      // A deliberately capped menu must never look like a slow GPU to Auto.
      if (this.graphics.observeFps(this.fps, racing)) this.applyQuality();
    }
    const ids = new Set(players.map(p => p.id));
    for (const [id, visual] of this.karts) if (!ids.has(id)) { this.removeKart(visual); this.karts.delete(id); }
    this.demo.group.visible = !world;
    for (const kart of players) {
      let visual = this.karts.get(kart.id);
      if (!visual) { visual = this.buildKart(kart.color, kart.name, kart.modelId, kart.characterId); this.karts.set(kart.id, visual); this.scene.add(visual.group); }
      if (visual.modelId !== normalizeKartModelId(kart.modelId) || visual.characterId !== normalizeCharacterId(kart.characterId)) this.setKartModel(visual, kart.modelId, kart.characterId);
      if (visual.color !== kart.color) { visual.model?.setColor(kart.color); visual.color = kart.color; }
      if (visual.name !== kart.name) { visual.group.remove(visual.label); visual.label.material.map?.dispose(); visual.label.material.dispose(); visual.label = label(kart.name); visual.group.add(visual.label); visual.name = kart.name; }
      visual.group.visible = !kart.spectator && !kart.abandoned;
      const groundY = kart.surface === 'offroad' ? 0.015
        : kart.surface === 'boost' || kart.surface === 'ice' || kart.surface === 'mud' ? 0.09 : 0.055;
      const pose = kartLoopPose(kart);
      visual.group.position.set(pose.x + pose.up.x * groundY, pose.y + pose.up.y * groundY, pose.z + pose.up.z * groundY);
      const near = nearestDriveableTrack(kart.x, kart.z, kart.trackId, kart.eventStage, kart.eventLevel,
        { progress: kart.routeProgress ?? kart.progress, elevation: kart.elevation });
      const shadow = visual.group.children.find(child => child.userData.role === 'contact-shadow');
      if (shadow) {
        const height = pose.active ? 0 : Math.max(0, (kart.elevation ?? 0) - driveableGroundHeight(near, kart.trackId, kart.elevation ?? 0));
        shadow.position.y = .01 - height; shadow.scale.setScalar(1 + height * .08);
      }
      if (pose.active) applyLoopOrientation(visual.group, pose);
      else visual.group.rotation.set(0, kart.angle, 0);
      if (visual.model) {
        const pitch = pose.active ? 0 : kart.airborne ? -Math.atan2(kart.verticalVelocity, Math.max(12, Math.abs(kart.speed))) * .45
          : -Math.atan(trackSlope(near.progress, kart.trackId)) * Math.cos(kart.angle - near.angle);
        visual.model.group.rotation.x += (pitch - visual.model.group.rotation.x) * (1 - Math.exp(-dt * 12));
        visual.model.animate(kart, dt, now);
      }
      visual.label.visible = kart.id !== localId && kart.id !== this.lastCameraId;
      visual.sparks.visible = kart.driftCharge > 0.1; visual.sparks.scale.setScalar(0.8 + (Math.sin(now * 0.08) + 1) * 0.4);
      visual.flames.visible = kart.boost > 0; visual.flames.scale.z = 0.85 + Math.sin(now * 0.1) * 0.2;
      visual.energy.visible = kart.invincible > 0; visual.energy.rotation.y = now * 0.004;
      visual.shield.visible = kart.shield > 0; visual.shield.scale.setScalar(1 + Math.sin(now * 0.006) * 0.025);
    }
    this.renderObjects(world, now);
    this.crown.update(world, players, now);
    const local = players.find(k => k.id === localId && !k.spectator && !k.abandoned) ?? (world && world.phase !== 'lobby' ? players.find(k => !k.spectator && !k.abandoned) : undefined);
    const following = local && world && world.phase !== 'lobby' && world.phase !== 'finished';
    if (following) {
      this.camera.near = 1;
      this.camera.far = 900;
      (this.scene.fog as THREE.Fog).near = 200; (this.scene.fog as THREE.Fog).far = 620;
      const blend = 1 - Math.exp(-cameraDt * 5);
      const pose = kartLoopPose(local), portrait = this.compactViewport && innerHeight > innerWidth;
      if (this.lastCameraId !== local.id) { this.cameraAngle = local.angle; this.cameraAim.set(pose.x, 1 + pose.y, pose.z); }
      this.cameraAngle += Math.atan2(Math.sin(local.angle - this.cameraAngle), Math.cos(local.angle - this.cameraAngle)) * (1 - Math.exp(-cameraDt * 4));
      const distance = (portrait ? 14.5 : 11.5) + Math.min(2.5, Math.abs(local.speed) / 16);
      const tunnelHeight = !pose.active ? crossingCameraHeight(local.routeProgress ?? local.progress, local.trackId) : undefined;
      const tunnelCameraY = tunnelHeight === undefined ? undefined : trackElevation(local.routeProgress ?? local.progress, local.trackId) + tunnelHeight;
      const aim = new THREE.Vector3();
      if (pose.active) {
        // Follow the road's forward direction independently of steering. This
        // keeps left/right readable on the inverted ribbon and shows the next
        // metres of road without swinging the camera at each lane change.
        const road = kartLoopRoadPosition(local);
        const frame = road ? trackLoopPose(road.progress, local.trackId) : pose;
        const chase = portrait ? 6.5 : 6, lift = portrait ? 4.5 : 4;
        this.cameraGoal.set(pose.x + frame.up.x * lift - frame.tangent.x * chase,
          pose.y + frame.up.y * lift - frame.tangent.y * chase,
          pose.z + frame.up.z * lift - frame.tangent.z * chase);
        aim.set(pose.x + frame.up.x + frame.tangent.x * 2,
          pose.y + frame.up.y + frame.tangent.y * 2, pose.z + frame.up.z + frame.tangent.z * 2);
      } else {
        const chase = tunnelHeight === undefined ? distance : 7;
        this.cameraGoal.set(local.x - Math.sin(this.cameraAngle) * chase, tunnelCameraY ?? (portrait ? 8.6 : 6.3) + local.elevation, local.z - Math.cos(this.cameraAngle) * chase);
        aim.set(local.x + Math.sin(this.cameraAngle) * 5.5, Math.min(1.05 + local.elevation, tunnelCameraY ?? Infinity), local.z + Math.cos(this.cameraAngle) * 5.5);
      }
      const followBlend = pose.active ? 1 - Math.exp(-cameraDt * 18) : blend;
      this.camera.position.lerp(this.cameraGoal, this.lastCameraId === local.id ? followBlend : 1);
      if (tunnelCameraY !== undefined) this.camera.position.y = Math.min(this.camera.position.y, tunnelCameraY);
      this.cameraAim.lerp(aim, followBlend);
      const desiredUp = new THREE.Vector3(pose.up.x, pose.up.y, pose.up.z);
      this.camera.up.lerp(desiredUp, followBlend).normalize();
      if (pose.active) {
        // Even at a low frame rate, smoothing must not cross the road deck.
        const clearance = (this.camera.position.x - pose.x) * pose.up.x +
          (this.camera.position.y - pose.y) * pose.up.y + (this.camera.position.z - pose.z) * pose.up.z;
        if (clearance < 3) this.camera.position.addScaledVector(desiredUp, 3 - clearance);
      }
      this.camera.lookAt(this.cameraAim); this.lastCameraId = local.id;
      const fov = (portrait ? 68 : this.compactViewport ? 60 : 55) + (local.boost > 0 ? 7 : 0); this.camera.fov += (fov - this.camera.fov) * blend; this.camera.updateProjectionMatrix();
    } else {
      this.camera.near = 10;
      const { centerX: x, centerZ: z, radius } = this.bounds;
      const angle = now * 0.000018 + 0.55;
      const framing = 1 / Math.min(1, this.camera.aspect);
      this.cameraGoal.set(x + Math.sin(angle) * radius * 1.75 * framing, radius * 2.25 * framing, z + Math.cos(angle) * radius * 1.75 * framing);
      this.camera.position.lerp(this.cameraGoal, 1 - Math.exp(-cameraDt * 2));
      this.cameraAim.lerp(new THREE.Vector3(x, 0, z), 1 - Math.exp(-cameraDt * 2));
      this.camera.up.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-cameraDt * 8)).normalize();
      const distance = this.camera.position.distanceTo(new THREE.Vector3(x, 0, z));
      // The complete island is far away: reserve depth precision for its thin
      // road layers instead of the empty space directly in front of the camera.
      this.camera.near = Math.max(10, distance * .1);
      this.camera.far = Math.max(900, distance + radius * 3);
      (this.scene.fog as THREE.Fog).near = Math.max(200, distance - radius * .25);
      (this.scene.fog as THREE.Fog).far = Math.max(620, distance + radius * 3);
      this.camera.lookAt(this.cameraAim); this.camera.fov += (52 - this.camera.fov) * Math.min(1, cameraDt * 3); this.camera.updateProjectionMatrix(); this.lastCameraId = '';
    }
    for (const visual of this.karts.values()) if (visual.label.visible) {
      const scale = Math.min(1, visual.group.position.distanceTo(this.camera.position) / 22);
      visual.label.scale.set(4.4 * scale, .92 * scale, 1);
    }
    this.trackEvents.updateCamera(this.camera);
    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    return true;
  }

  private renderObjects(world: World | null, now: number) {
    const roadPose = (x: number, z: number, angle: number, progress?: number, elevation?: number) => {
      const near = nearestDriveableTrack(x, z, this.track.id, world?.eventStage, world?.eventLevel, { progress, elevation });
      return kartLoopPose({ x, z, angle, trackId: this.track.id, elevation: elevation ?? trackElevation(near.progress, this.track.id), routeProgress: progress ?? near.progress,
        loopId: near.branchId ? '' : trackLoopAt(near.progress, this.track.id)?.id ?? '' });
    };
    const pickups = world?.pickups ?? [];
    for (const pickup of pickups) {
      let visual = this.pickups.get(pickup.id);
      if (!visual) {
        visual = new THREE.Group();
        const cube = box('#a5ffe9', 0, 0, 0, 1.7, 1.7, 1.7); (cube.material as THREE.MeshStandardMaterial) = material('#8ce8d0', 0.2);
        visual.add(cube, mysteryBadge());
        this.pickups.set(pickup.id, visual); this.scene.add(visual);
      }
      const pose = roadPose(pickup.x, pickup.z, 0, pickup.progress, pickup.elevation), hover = 1.6 + Math.sin(now * .003 + pickup.x) * .25;
      visual.visible = pickup.cooldown <= 0;
      visual.position.set(pose.x + pose.up.x * hover, pose.y + pose.up.y * hover, pose.z + pose.up.z * hover);
      applyLoopOrientation(visual, pose); visual.rotateY(now * .0009); visual.rotateX(.15); visual.rotateZ(.15);
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
          visual.add(mesh(trapGeometry, '#ffbf47', 0, 0.7, 0), mesh(objectBaseGeometry, '#ee704a', 0, 0.15, 0));
        } else if (object.kind === 'seeker') {
          const rocket = mesh(rocketGeometry, '#ff5b67', 0, 0.85, 0); rocket.rotation.x = Math.PI / 2;
          visual.add(rocket, box('#fff0cc', 0, 0.8, -0.45, 1.6, 0.14, 0.6), mesh(sphereGeometry, '#ffcf63', 0, 0.85, -1, 0.3, 0.3, 0.6));
        } else if (object.kind === 'leaderBolt') {
          visual.add(mesh(sphereGeometry, '#4c9dff', 0, 1.5, 0, 0.9, 0.9, 1.1),
            box('#e7faff', 0, 1.5, 0, 2.1, 0.18, 0.4), mesh(sphereGeometry, '#9edcff', 0, 1.5, -1.3, 0.45, 0.45, 1));
          const crown = mesh(starGeometry, '#fff28e', 0, 2.6, 0); visual.add(crown);
        } else visual.add(mesh(sphereGeometry, '#62d982', 0, 0.85, 0, 0.85, 0.65, 1.2), box('#fff0cc', 0, 0.85, 0, 1.8, 0.15, 0.3));
        this.objects.set(object.id, visual); this.scene.add(visual);
      }
      const pose = roadPose(object.x, object.z, object.angle, object.progress, object.elevation);
      visual.position.set(pose.x, pose.y, pose.z); applyLoopOrientation(visual, pose);
    }
  }
}
