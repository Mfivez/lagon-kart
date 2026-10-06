import * as THREE from 'three';
import { getTrack, nearestTrack, trackElevation, trackPoint, type Vec2 } from '../shared/track';
import { getTrackEvent, type TrackBranch, type TrackEventInfo } from '../shared/track-events';

function ribbon(points: Array<Vec2 & { progress?: number }>, width: number, height: number, trackId: string) {
  const positions: number[] = [], indices: number[] = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]!, after = points[Math.min(points.length - 1, index + 1)]!;
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
    const y = height + trackElevation(point.progress ?? nearestTrack(point.x, point.z, trackId).progress, trackId);
    for (const side of [-1, 1]) positions.push(point.x + dz / length * side * width / 2, y, point.z - dx / length * side * width / 2);
    if (index < points.length - 1) { const n = index * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Procedural ribbons, signs and weather, rebuilt only when the shared phase changes. */
export class TrackEventsView {
  readonly group = new THREE.Group();
  private key = '';
  private trackId = 'lagon';
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly rock = new THREE.IcosahedronGeometry(1, 0);
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private weather: THREE.Points | null = null;
  private weatherKind = 'clear';
  private signTextures: THREE.Texture[] = [];
  private signMaterials: THREE.Material[] = [];
  constructor(parent?: THREE.Object3D) { this.group.name = 'track-events'; if (parent) this.attach(parent); }
  attach(parent: THREE.Object3D) { parent.add(this.group); return this; }

  private material(color: string) {
    let result = this.materials.get(color);
    if (!result) { result = new THREE.MeshStandardMaterial({ color, roughness: .88, side: THREE.DoubleSide }); this.materials.set(color, result); }
    return result;
  }
  private mesh(geometry: THREE.BufferGeometry, color: string) {
    const result = new THREE.Mesh(geometry, this.material(color)); result.receiveShadow = true; this.group.add(result); return result;
  }
  private post(x: number, z: number, color: string, height = 1, progress?: number) {
    const mesh = this.mesh(this.box, color); mesh.position.set(x, height / 2 + trackElevation(progress ?? nearestTrack(x, z, this.trackId).progress, this.trackId), z); mesh.scale.set(.35, height, .35); return mesh;
  }
  private sign(text: string, point: Vec2 & { progress?: number }, color: string) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#163038'; ctx.fillRect(0, 0, 512, 112); ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 104);
    ctx.fillStyle = '#fff7df'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 56, 480);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: true });
    const y = trackElevation(point.progress ?? nearestTrack(point.x, point.z, this.trackId).progress, this.trackId);
    const sprite = new THREE.Sprite(material); sprite.position.set(point.x, y + 3.8, point.z); sprite.scale.set(9, 1.8, 1);
    this.signTextures.push(texture); this.signMaterials.push(material); this.group.add(sprite);
  }
  private route(route: TrackBranch, event: TrackEventInfo) {
    const track = getTrack(event.trackId);
    const start = route.points[0]!, offset = route.kind === 'shortcut' ? -track.width / 2 - 1.5 : track.width / 2 + 1.5;
    const signPoint = { x: start.x + Math.cos(start.angle) * offset, z: start.z - Math.sin(start.angle) * offset, progress: route.start };
    const warning = trackPoint(route.start - 42, track.id);
    const warningPoint = { x: warning.x + Math.cos(warning.angle) * offset, z: warning.z - Math.sin(warning.angle) * offset, progress: route.start - 42 };
    if (!route.open) { this.sign('RACCOURCI · OUVRE AU TOUR 3', signPoint, '#e7aa61'); return; }
    const accent = route.kind === 'detour' ? '#ffe28c' : route.kind === 'technical' ? '#b7eeff' : '#83f6b7';
    this.mesh(ribbon(route.points, route.width + 1.1, .023, track.id), accent);
    this.mesh(ribbon(route.points, route.width, .035, track.id), track.palette.road);
    const overlay = (from: number, to: number, color: string) => {
      const startProgress = route.start + (route.end - route.start) * from, endProgress = route.start + (route.end - route.start) * to;
      const points = route.points.filter(point => point.progress >= startProgress && point.progress <= endProgress);
      this.mesh(ribbon(points, route.width - .45, .051, track.id), color);
    };
    if (route.kind === 'technical') { overlay(.2, .35, '#70d9a7'); overlay(.6, .7, '#aadce9'); }
    for (let index = 5; index < route.points.length - 4; index += 5) {
      const point = route.points[index]!;
      for (const side of [-1, 1]) this.post(point.x + Math.cos(point.angle) * side * (route.width / 2 + .6),
        point.z - Math.sin(point.angle) * side * (route.width / 2 + .6), accent, .65, point.progress);
    }
    const saved = Math.round((1 - route.length / (route.end - route.start)) * 100);
    const title = route.kind === 'detour' ? 'DÉVIATION LARGE · OBJETS' : route.kind === 'technical' ? 'VOIE TURBO · GRANDES COURBES' : 'RACCOURCI · −' + saved + ' %';
    this.sign(title, signPoint, accent);
    this.sign(route.kind === 'shortcut' ? 'RACCOURCI À 40 m · ←' : 'BIFURCATION À 40 m · →', warningPoint, accent);
    // Chevrons show the entry direction without requiring text or a minimap.
    for (const index of [4, 9, 14]) {
      const point = route.points[index]!;
      const arrow = this.mesh(this.box, accent); arrow.position.set(point.x, .075 + trackElevation(point.progress, track.id), point.z); arrow.rotation.y = point.angle; arrow.scale.set(.8, .05, 2.5);
    }
  }

  private rebuild(event: TrackEventInfo) {
    this.clear();
    const track = getTrack(event.trackId);
    this.trackId = track.id;
    for (const route of event.branches) this.route(route, event);
    for (const blocker of event.blockers) {
      const icy = track.theme === 'ice', wet = track.theme === 'tropical';
      const zone = this.mesh(this.box, icy ? '#d6f3fb' : wet ? '#368e9d' : '#473e3a');
      const groundY = trackElevation(nearestTrack(blocker.x, blocker.z, track.id).progress, track.id);
      zone.position.set(blocker.x, groundY + .085, blocker.z); zone.rotation.y = blocker.angle;
      zone.scale.set(blocker.halfWidth * 2, .17, blocker.halfLength * 2 + 1.2);
      for (let index = 0; index < 9; index++) {
        const across = (index / 8 * 2 - 1) * (blocker.halfWidth - 1);
        const object = this.mesh(wet || track.theme === 'neon' ? this.box : this.rock,
          icy ? '#bddfec' : wet ? '#edbd67' : track.theme === 'neon' ? '#f2ab61' : '#906b55');
        object.position.set(blocker.x + Math.cos(blocker.angle) * across, groundY + .65 + index % 2 * .15,
          blocker.z - Math.sin(blocker.angle) * across);
        object.scale.set(1.4, 1.3 + index % 2 * .3, 1.2); object.rotation.y = blocker.angle + index * .18; object.castShadow = true;
      }
      const before = { x: blocker.x - Math.sin(blocker.angle) * 4, z: blocker.z - Math.cos(blocker.angle) * 4 };
      this.sign('ROUTE BARRÉE · DÉVIATION →', before, '#ffc16d');
    }
    if (event.weather !== 'clear') {
      const surfaceColor = track.theme === 'ice' ? '#c6e8f5' : '#847c6c';
      for (const [start, end] of [[.51, .565], ...(event.level === 3 && event.stage === 2 ? [[.86, .90]] : [])]) {
        const points = Array.from({ length: 19 }, (_, i) => { const progress = (start + (end - start) * i / 18) * track.length; return { ...trackPoint(progress, track.id), progress }; });
        this.mesh(ribbon(points, track.width - .2, .065, track.id), surfaceColor);
        this.sign(track.theme === 'ice' ? 'VERGLAS' : event.weather === 'ash' ? 'CENDRES · RALENTISSEZ' : 'SOL DÉTREMPÉ', points[0]!, '#a8d8ea');
      }
      const positions = new Float32Array(180 * 3);
      const minX = Math.min(...track.points.map(point => point.x)) - 24, maxX = Math.max(...track.points.map(point => point.x)) + 24;
      const minZ = Math.min(...track.points.map(point => point.z)) - 24, maxZ = Math.max(...track.points.map(point => point.z)) + 24;
      for (let i = 0; i < 180; i++) {
        positions[i * 3] = minX + ((i * .61803398875) % 1) * (maxX - minX);
        positions[i * 3 + 1] = ((i * .38196601125) % 1) * 24;
        positions[i * 3 + 2] = minZ + ((i * .41421356237) % 1) * (maxZ - minZ);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({ color: event.weather === 'ash' ? '#a87e58' : '#dceef5', size: event.weather === 'snow' ? .45 : .2,
        transparent: true, opacity: .6, depthWrite: false });
      this.signMaterials.push(material); this.weather = new THREE.Points(geometry, material); this.weather.frustumCulled = false;
      this.weatherKind = event.weather; this.group.add(this.weather);
    }
    // Posts, arrows and debris share a handful of draw calls and geometries.
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of this.group.children) if (child instanceof THREE.Mesh && (child.geometry === this.box || child.geometry === this.rock)) {
      const key = child.geometry.uuid + ':' + (child.material as THREE.Material).uuid;
      const batch = batches.get(key) ?? []; batch.push(child); batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      const first = batch[0]!;
      const instances = new THREE.InstancedMesh(first.geometry, first.material, batch.length);
      batch.forEach((object, index) => { object.updateMatrix(); instances.setMatrixAt(index, object.matrix); object.removeFromParent(); });
      instances.castShadow = batch.some(object => object.castShadow); instances.receiveShadow = true; this.group.add(instances);
    }
  }

  update(trackId: string, stage = 0, level = 0, time = 0) {
    const event = getTrackEvent(trackId, stage, level), key = [event.trackId, event.stage, event.level].join(':');
    if (key !== this.key) { this.key = key; this.rebuild(event); }
    if (this.weather) {
      const positions = this.weather.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) positions.setY(i, ((i * 9.167 - time * (this.weatherKind === 'snow' ? 2.3 : 9)) % 24 + 24) % 24);
      positions.needsUpdate = true;
    }
  }
  private clear() {
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) geometries.add(object.geometry); if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.group.clear();
    for (const geometry of geometries) if (geometry !== this.box && geometry !== this.rock) geometry.dispose();
    for (const texture of this.signTextures) texture.dispose();
    for (const material of this.signMaterials) material.dispose();
    this.signTextures = []; this.signMaterials = []; this.weather = null;
  }
  dispose() { this.clear(); this.group.removeFromParent(); this.box.dispose(); this.rock.dispose(); for (const material of this.materials.values()) material.dispose(); this.materials.clear(); this.key = ''; }
}
