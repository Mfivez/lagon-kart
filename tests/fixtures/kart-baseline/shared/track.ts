export interface Vec2 { x: number; z: number }
export const TRACK_IDS = ['lagon', 'canyon', 'glacier', 'neon'] as const;
export type TrackId = typeof TRACK_IDS[number];
export interface TrackZone {
  id: string; kind: 'boost' | 'ice' | 'mud';
  /** Metres from start; intervals never wrap across the finish line. */
  start: number; end: number; offset: number; width: number;
}
export interface TrackDefinition {
  id: TrackId; name: string; description: string;
  difficulty: 'Facile' | 'Intermédiaire' | 'Technique'; theme: 'tropical' | 'canyon' | 'ice' | 'neon';
  points: Vec2[]; length: number; width: number;
  checkpoints: Array<Vec2 & { angle: number; progress: number }>;
  zones: TrackZone[];
  palette: { sky: string; water: string; ground: string; road: string; accent: string };
  grip: number;
}
export type Surface = 'road' | 'offroad' | TrackZone['kind'];
export const TOTAL_LAPS = 3;
export const COLORS = ['#fc735d', '#69cbd0', '#fed36a', '#bca4ef', '#92cf84', '#fa9ac4', '#638ce6', '#f4f1de'];
interface ArcTable { lengths: number[]; cumulative: number[] }
const arcTables = new Map<TrackId, ArcTable>();
function spline(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * ((2 * p1) + (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
type TrackSeed = Omit<TrackDefinition, 'points' | 'length' | 'checkpoints' | 'zones'> & {
  anchors: [number, number][];
  zones: Array<Omit<TrackZone, 'id'>>;
};
function makeTrack(seed: TrackSeed): TrackDefinition {
  const anchors = seed.anchors.map(([x, z]) => ({ x, z }));
  const points = anchors.flatMap((point, i) => {
    const previous = anchors[(i + anchors.length - 1) % anchors.length]!;
    const next = anchors[(i + 1) % anchors.length]!;
    const after = anchors[(i + 2) % anchors.length]!;
    return Array.from({ length: 24 }, (_, j) => ({
      x: spline(previous.x, point.x, next.x, after.x, j / 24),
      z: spline(previous.z, point.z, next.z, after.z, j / 24),
    }));
  });
  const lengths = points.map((point, i) => Math.hypot(
    points[(i + 1) % points.length]!.x - point.x, points[(i + 1) % points.length]!.z - point.z));
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative[cumulative.length - 1]! + length);
  arcTables.set(seed.id, { lengths, cumulative });
  const length = cumulative[cumulative.length - 1]!;
  const track: TrackDefinition = { id: seed.id, name: seed.name, description: seed.description,
    difficulty: seed.difficulty, theme: seed.theme, width: seed.width, palette: seed.palette, grip: seed.grip,
    points, length, checkpoints: [], zones: seed.zones.map((zone, index) => ({ ...zone,
      id: seed.id + '-' + zone.kind + '-' + index, start: zone.start * length, end: zone.end * length })) };
  track.checkpoints = Array.from({ length: 12 }, (_, i) => ({
    ...pointOnTrack(i * length / 12, track), progress: i * length / 12,
  }));
  return track;
}
// Four original closed circuits. The final sampled point connects to the first.
export const TRACKS: TrackDefinition[] = [
  makeTrack({ id: 'lagon', name: 'Île des Alizés', theme: 'tropical', difficulty: 'Facile', width: 16, grip: 1,
    description: 'De grandes courbes pour apprendre le drift. Visez les bandes turbo et évitez les flaques de boue.',
    palette: { sky: '#cbe8df', water: '#56b8b0', ground: '#c8dca1', road: '#667976', accent: '#f5bd62' },
    anchors: [[0,-88],[70,-83],[104,-30],[88,24],[44,71],[-15,92],[-82,66],[-103,7],[-68,-60]],
    zones: [ { kind: 'boost', start: .10, end: .12, offset: 0, width: 7 },
      { kind: 'mud', start: .35, end: .39, offset: 4.8, width: 5.5 },
      { kind: 'boost', start: .68, end: .70, offset: -3, width: 6 } ],
  }),
  makeTrack({ id: 'canyon', name: 'Canyon solaire', theme: 'canyon', difficulty: 'Intermédiaire', width: 15, grip: 1.08,
    description: 'Des virages resserrés entre les falaises. Évitez la boue et préparez vos mini-turbos avant les lignes droites.',
    palette: { sky: '#f5d7b6', water: '#bc8261', ground: '#d99b67', road: '#795f56', accent: '#ffb342' },
    anchors: [[0,-105],[70,-102],[116,-58],[92,-7],[112,50],[68,100],[5,94],[-33,52],[-87,44],[-103,-12],[-65,-87]],
    zones: [ { kind: 'boost', start: .05, end: .075, offset: 0, width: 6 },
      { kind: 'mud', start: .29, end: .34, offset: -3.5, width: 7 },
      { kind: 'mud', start: .60, end: .655, offset: 3.5, width: 7 },
      { kind: 'boost', start: .87, end: .89, offset: 0, width: 7 } ],
  }),
  makeTrack({ id: 'glacier', name: 'Banquise boréale', theme: 'ice', difficulty: 'Technique', width: 18, grip: .86,
    description: 'La glace conserve votre élan et ralentit les changements de direction. Anticipez les virages et freinez avant les plaques bleues.',
    palette: { sky: '#c5dced', water: '#538faa', ground: '#e7f3ed', road: '#9dc9d3', accent: '#76eeeb' },
    anchors: [[0,-112],[58,-91],[101,-40],[113,28],[82,89],[25,106],[-36,76],[-89,68],[-117,6],[-85,-56],[-43,-89]],
    zones: [ { kind: 'ice', start: .14, end: .24, offset: 0, width: 18 },
      { kind: 'boost', start: .36, end: .38, offset: -4, width: 6 },
      { kind: 'ice', start: .53, end: .65, offset: 0, width: 18 },
      { kind: 'ice', start: .79, end: .86, offset: 3, width: 9 } ],
  }),
  makeTrack({ id: 'neon', name: 'Métropole néon', theme: 'neon', difficulty: 'Intermédiaire', width: 17, grip: 1.03,
    description: 'Une chicane urbaine et trois bandes turbo. Changez de ligne pour enchaîner les accélérations et profiter de l’aspiration.',
    palette: { sky: '#1b2547', water: '#293153', ground: '#454f72', road: '#303549', accent: '#ef71d8' },
    anchors: [[0,-96],[66,-96],[101,-62],[101,-10],[67,15],[103,50],[76,87],[7,88],[-69,88],[-104,48],[-100,-32],[-64,-91]],
    zones: [ { kind: 'boost', start: .07, end: .09, offset: -3.5, width: 6 },
      { kind: 'boost', start: .53, end: .555, offset: 3.5, width: 6 },
      { kind: 'boost', start: .80, end: .825, offset: 0, width: 7 } ],
  }),
];
export function isTrackId(id: unknown): id is TrackId {
  return typeof id === 'string' && TRACK_IDS.includes(id as TrackId);
}
export function getTrack(id = 'lagon'): TrackDefinition { return TRACKS.find(track => track.id === id) ?? TRACKS[0]!; }
function pointOnTrack(progress: number, track: TrackDefinition): Vec2 & { angle: number } {
  const wrapped = ((progress % track.length) + track.length) % track.length;
  const { cumulative, lengths } = arcTables.get(track.id)!;
  let low = 0; let high = track.points.length - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (cumulative[middle + 1]! <= wrapped) low = middle + 1; else high = middle; }
  const point = track.points[low]!;
  const next = track.points[(low + 1) % track.points.length]!;
  const t = (wrapped - cumulative[low]!) / lengths[low]!;
  return { x: point.x + (next.x - point.x) * t, z: point.z + (next.z - point.z) * t,
    angle: Math.atan2(next.x - point.x, next.z - point.z) };
}
export function trackPoint(progress: number, trackId = 'lagon'): Vec2 & { angle: number } {
  return pointOnTrack(progress, getTrack(trackId));
}
export function nearestTrack(x: number, z: number, trackId = 'lagon'): Vec2 & { distance: number; progress: number; index: number; angle: number } {
  const track = getTrack(trackId);
  const { lengths, cumulative } = arcTables.get(track.id)!;
  let result = { x: 0, z: 0, distance: Infinity, progress: 0, index: 0, angle: 0 };
  let bestSquared = Infinity;
  for (let i = 0; i < track.points.length; i++) {
    const a = track.points[i]!;
    const b = track.points[(i + 1) % track.points.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const squared = (x - px) ** 2 + (z - pz) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      result = { x: px, z: pz, distance: Math.sqrt(squared), progress: cumulative[i]! + lengths[i]! * t,
        index: i, angle: Math.atan2(dx, dz) };
    }
  }
  return result;
}
export function trackSurface(x: number, z: number, trackId = 'lagon', near = nearestTrack(x, z, trackId)):
  { surface: Surface; zone?: TrackZone } {
  const track = getTrack(trackId);
  if (near.distance > track.width / 2) return { surface: 'offroad' };
  const offset = (x - near.x) * Math.cos(near.angle) - (z - near.z) * Math.sin(near.angle);
  const zone = track.zones.find(candidate => near.progress >= candidate.start && near.progress <= candidate.end &&
    Math.abs(offset - candidate.offset) <= candidate.width / 2);
  return zone ? { surface: zone.kind, zone } : { surface: 'road' };
}
export function spawnPoint(index: number, trackId = 'lagon'): Vec2 & { angle: number } {
  const point = trackPoint(-6 - Math.floor(index / 2) * 5, trackId);
  const side = index % 2 === 0 ? -2.5 : 2.5;
  return { x: point.x + Math.cos(point.angle) * side,
    z: point.z - Math.sin(point.angle) * side, angle: point.angle };
}
// Legacy aliases keep existing integrations valid; new code selects a track.
export const TRACK = TRACKS[0]!.points;
export const TRACK_LENGTH = TRACKS[0]!.length;
export const ROAD_WIDTH = TRACKS[0]!.width;
export const CHECKPOINTS = TRACKS[0]!.checkpoints;
