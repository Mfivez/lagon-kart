export const TRACK_LAYOUT_REVISION = 2;
export interface TrackLoop { id: string; start: number; end: number; height: number; lateralSpread: number }
export interface Vec2 { x: number; z: number }
export const TRACK_IDS = ['lagon', 'canyon', 'glacier', 'neon', 'mangrove', 'dunes', 'volcan', 'forest', 'harbor', 'sky', 'foundry', 'castle'] as const;
export type TrackId = typeof TRACK_IDS[number];
export interface TrackZone {
  id: string; kind: 'boost' | 'ice' | 'mud';
  /** Metres from start; intervals never wrap across the finish line. */
  start: number; end: number; offset: number; width: number;
}
export interface TrackElevation {
  id: string; kind: 'bridge' | 'jump';
  /** Ground profile in metres along the main route, never across the finish line. */
  start: number; end: number; height: number; approach: number;
  /** Vertical launch velocity at the end of a jump ramp, metres per second. */
  launchSpeed?: number;
}
export interface TrackDefinition {
  id: TrackId; name: string; description: string;
  difficulty: 'Facile' | 'Intermédiaire' | 'Technique';
  theme: 'tropical' | 'canyon' | 'ice' | 'neon' | 'volcano' | 'forest' | 'harbor' | 'sky' | 'foundry' | 'castle';
  points: Vec2[]; length: number; width: number;
  checkpoints: Array<Vec2 & { angle: number; progress: number }>;
  zones: TrackZone[];
  elevations: TrackElevation[];
  loops: TrackLoop[];
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
type TrackSeed = Omit<TrackDefinition, 'points' | 'length' | 'checkpoints' | 'zones' | 'elevations' | 'loops'> & {
  anchors: [number, number][];
  zones: Array<Omit<TrackZone, 'id'>>;
  elevations?: Array<Omit<TrackElevation, 'id'>>;
  loops?: Array<Omit<TrackLoop, 'id'>>;
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
    points, length, checkpoints: [], loops: (seed.loops ?? []).map((loop, index) => ({ ...loop,
      id: `${seed.id}-magnetic-loop-${index}`, start: loop.start * length, end: loop.end * length })), elevations: (seed.elevations ?? []).map((feature, index) => ({ ...feature,
      id: `${seed.id}-${feature.kind}-${index}`, start: feature.start * length, end: feature.end * length })),
    zones: seed.zones.map((zone, index) => ({ ...zone,
      id: seed.id + '-' + zone.kind + '-' + index, start: zone.start * length, end: zone.end * length })) };
  track.checkpoints = Array.from({ length: 12 }, (_, i) => ({
    ...pointOnTrack(i * length / 12, track), progress: i * length / 12,
  }));
  return track;
}
// Closed circuits. The final sampled point connects to the first.
export const TRACKS: TrackDefinition[] = [
  makeTrack({ id: 'lagon', name: 'Île des Alizés', theme: 'tropical', difficulty: 'Facile', width: 16, grip: 1,
    description: 'De grandes courbes pour apprendre le drift. Visez les bandes turbo et évitez les flaques de boue.',
    palette: { sky: '#cbe8df', water: '#56b8b0', ground: '#c8dca1', road: '#667976', accent: '#f5bd62' },
    anchors: [[0,-92],[70,-83],[113,-22],[95,43],[38,87],[-28,73],[-82,38],[-107,-19],[-66,-75]],
    zones: [ { kind: 'boost', start: .10, end: .12, offset: 0, width: 7 },
      { kind: 'mud', start: .35, end: .39, offset: 4.8, width: 5.5 },
      { kind: 'boost', start: .68, end: .70, offset: -3, width: 6 } ],
  }),
  makeTrack({ id: 'canyon', name: 'Canyon solaire', theme: 'canyon', difficulty: 'Intermédiaire', width: 15, grip: 1.08,
    description: 'Des virages resserrés entre les falaises. Évitez la boue et préparez vos mini-turbos avant les lignes droites.',
    palette: { sky: '#f5d7b6', water: '#bc8261', ground: '#d99b67', road: '#795f56', accent: '#ffb342' },
    anchors: [[0,-116],[68,-105],[113,-59],[99,-5],[50,25],[30,83],[-13,106],[-66,70],[-106,6],[-93,-61],[-51,-103]],
    zones: [ { kind: 'boost', start: .05, end: .075, offset: 0, width: 6 },
      { kind: 'mud', start: .29, end: .34, offset: -3.5, width: 7 },
      { kind: 'mud', start: .60, end: .655, offset: 3.5, width: 7 },
      { kind: 'boost', start: .87, end: .89, offset: 0, width: 7 } ],
  }),
  makeTrack({ id: 'glacier', name: 'Banquise boréale', theme: 'ice', difficulty: 'Technique', width: 18, grip: .86,
    description: 'La glace conserve votre élan et ralentit les changements de direction. Anticipez les virages et freinez avant les plaques bleues.',
    palette: { sky: '#c5dced', water: '#538faa', ground: '#e7f3ed', road: '#9dc9d3', accent: '#76eeeb' },
    anchors: [[0,-118],[60,-107],[105,-65],[98,-8],[65,59],[16,112],[-43,95],[-98,44],[-105,-20],[-66,-89]],
    zones: [ { kind: 'ice', start: .14, end: .24, offset: 0, width: 18 },
      { kind: 'boost', start: .36, end: .38, offset: -4, width: 6 },
      { kind: 'ice', start: .53, end: .65, offset: 0, width: 18 },
      { kind: 'ice', start: .79, end: .86, offset: 3, width: 9 } ],
  }),
  makeTrack({ id: 'neon', name: 'Métropole néon', theme: 'neon', difficulty: 'Intermédiaire', width: 17, grip: 1.03,
    description: 'Une chicane urbaine et trois bandes turbo. Changez de ligne pour enchaîner les accélérations et profiter de l’aspiration.',
    palette: { sky: '#1b2547', water: '#293153', ground: '#454f72', road: '#303549', accent: '#ef71d8' },
    anchors: [[0,-100],[68,-100],[109,-59],[108,13],[77,67],[10,82],[-65,82],[-109,45],[-110,-32],[-73,-89]],
    zones: [ { kind: 'boost', start: .07, end: .09, offset: -3.5, width: 6 },
      { kind: 'boost', start: .53, end: .555, offset: 3.5, width: 6 },
      { kind: 'boost', start: .80, end: .825, offset: 0, width: 7 } ],
  }),
  makeTrack({ id: 'mangrove', name: 'Mangrove sinueuse', theme: 'tropical', difficulty: 'Technique', width: 16, grip: .98,
    description: 'Une double courbe entre les marais. La boue alterne d’un bord à l’autre : gardez une ligne propre pour rejoindre les deux turbos.',
    palette: { sky: '#bed0bd', water: '#427c70', ground: '#749666', road: '#556660', accent: '#e2c674' },
    anchors: [[0,-111],[63,-90],[100,-40],[66,7],[75,66],[28,103],[-25,82],[-73,91],[-112,41],[-90,-14],[-94,-67],[-54,-105]],
    zones: [ { kind: 'mud', start: .16, end: .205, offset: 4, width: 6 },
      { kind: 'mud', start: .34, end: .38, offset: -4, width: 6 },
      { kind: 'boost', start: .46, end: .48, offset: 0, width: 6 },
      { kind: 'mud', start: .61, end: .66, offset: 4, width: 6 },
      { kind: 'mud', start: .84, end: .88, offset: -4, width: 6 },
      { kind: 'boost', start: .93, end: .95, offset: 0, width: 6 } ],
  }),
  makeTrack({ id: 'dunes', name: 'Dunes de cuivre', theme: 'canyon', difficulty: 'Facile', width: 15, grip: 1.04,
    description: 'Deux longues lignes droites et quatre bandes turbo pour jouer l’aspiration. Les flaques de boue à la sortie des courbes punissent les trajectoires trop larges.',
    palette: { sky: '#efc7a8', water: '#c38b68', ground: '#e3b87e', road: '#876b58', accent: '#f1d082' },
    anchors: [[0,-64],[83,-64],[129,-38],[136,15],[100,59],[22,64],[-60,64],[-126,40],[-143,-2],[-121,-42],[-72,-64]],
    zones: [ { kind: 'boost', start: .065, end: .085, offset: -3.5, width: 6 },
      { kind: 'mud', start: .20, end: .235, offset: 4, width: 6 },
      { kind: 'boost', start: .34, end: .36, offset: 3.5, width: 6 },
      { kind: 'boost', start: .53, end: .55, offset: -3.5, width: 6 },
      { kind: 'mud', start: .70, end: .745, offset: 4, width: 6 },
      { kind: 'boost', start: .84, end: .86, offset: 3.5, width: 6 } ],
  }),
  makeTrack({ id: 'volcan', name: 'Caldeira ardente', theme: 'volcano', difficulty: 'Intermédiaire', width: 22, grip: 1.04,
    description: 'Un grand anneau autour du cratère, un viaduc au-dessus de la lave et un tremplin de basalte. Gardez votre vitesse sur les larges courbes.',
    palette: { sky: '#e5a985', water: '#cd633d', ground: '#6f665c', road: '#5b5554', accent: '#ffb15d' },
    anchors: [[0,-185],[126,-154],[188,-63],[166,43],[86,115],[0,169],[-110,156],[-183,70],[-178,-20],[-113,-60],[-99,-127]],
    zones: [{ kind: 'boost', start: .08, end: .1, offset: 0, width: 10 },
      { kind: 'mud', start: .4, end: .44, offset: 6.5, width: 8 },
      { kind: 'boost', start: .61, end: .63, offset: 0, width: 10 },
      { kind: 'boost', start: .86, end: .88, offset: -4, width: 8 }],
    elevations: [{ kind: 'bridge', start: .18, end: .31, height: 5, approach: 50 },
      { kind: 'jump', start: .323, end: .34, height: 2.1, approach: 0, launchSpeed: 7.2 }],
  }),
  makeTrack({ id: 'forest', name: 'Forêt des géants', theme: 'forest', difficulty: 'Intermédiaire', width: 22, grip: .99,
    description: 'De longues courbes entre des séquoias, un pont de bois au-dessus du ruisseau et un saut de racines. Les bandes boueuses laissent une trajectoire sèche.',
    palette: { sky: '#cbdcc2', water: '#7dada4', ground: '#80a070', road: '#697463', accent: '#dec77c' },
    anchors: [[0,-201],[100,-188],[174,-130],[154,-46],[112,22],[147,96],[95,172],[6,199],[-80,168],[-139,106],[-113,32],[-160,-51],[-151,-137],[-75,-189]],
    zones: [{ kind: 'mud', start: .13, end: .17, offset: 6.5, width: 8 },
      { kind: 'boost', start: .32, end: .34, offset: -3, width: 9 },
      { kind: 'mud', start: .69, end: .73, offset: -6.5, width: 8 },
      { kind: 'boost', start: .79, end: .81, offset: 0, width: 9 }],
    elevations: [{ kind: 'bridge', start: .46, end: .58, height: 4.5, approach: 45 },
      { kind: 'jump', start: .174, end: .194, height: 1.6, approach: 0, launchSpeed: 6.3 }],
  }),
  makeTrack({ id: 'harbor', name: 'Port des cargos', theme: 'harbor', difficulty: 'Facile', width: 24, grip: 1.05,
    description: 'Les grands quais offrent de l’espace pour dépasser. Traversez le pont métallique, longez les grues et sautez le tremplin de chargement.',
    palette: { sky: '#c8e3e8', water: '#458b9d', ground: '#b8b9a3', road: '#667b85', accent: '#f2c96b' },
    anchors: [[0,-132],[135,-132],[218,-111],[239,-49],[226,53],[169,124],[64,130],[-68,129],[-175,118],[-218,63],[-219,-40],[-183,-113],[-99,-132]],
    zones: [{ kind: 'boost', start: .07, end: .095, offset: -4, width: 10 },
      { kind: 'ice', start: .48, end: .52, offset: 6, width: 8 },
      { kind: 'boost', start: .64, end: .665, offset: 0, width: 10 },
      { kind: 'boost', start: .88, end: .9, offset: 4, width: 10 }],
    elevations: [{ kind: 'bridge', start: .26, end: .4, height: 6, approach: 60 },
      { kind: 'jump', start: .487, end: .506, height: 2.4, approach: 0, launchSpeed: 7.8 }],
  }),
  makeTrack({ id: 'sky', name: 'Archipel céleste', theme: 'sky', difficulty: 'Technique', width: 24, grip: 1,
    description: 'Un looping magnétique dans les nuages, deux ponts et un grand saut sur un parcours en aile. Le rail magnétique vous retient même à petite vitesse.',
    palette: { sky: '#c5deef', water: '#bdd9ed', ground: '#d1dfaa', road: '#9ca5b5', accent: '#c49be2' },
    anchors: [[0,-180],[125,-180],[211,-120],[188,-21],[115,43],[37,154],[-39,201],[-122,153],[-146,57],[-213,-11],[-207,-100],[-127,-169]],
    zones: [{ kind: 'boost', start: .06, end: .08, offset: 0, width: 10 },
      { kind: 'boost', start: .38, end: .4, offset: 0, width: 11 },
      { kind: 'ice', start: .53, end: .565, offset: 6.5, width: 8 },
      { kind: 'boost', start: .84, end: .86, offset: -4, width: 10 }],
    loops: [{ start: .013, end: .079, height: 32, lateralSpread: 24 }],
    elevations: [{ kind: 'bridge', start: .13, end: .28, height: 7, approach: 70 },
      { kind: 'jump', start: .29, end: .305, height: 2.3, approach: 0, launchSpeed: 8.2 },
      { kind: 'bridge', start: .63, end: .76, height: 5.5, approach: 55 }],
  }),
  makeTrack({ id: 'foundry', name: 'Fonderie des pistons', theme: 'foundry', difficulty: 'Intermédiaire', width: 22, grip: 1.03,
    description: 'Un looping magnétique d’essai, un tracé en coude entre les hauts-fourneaux et une passerelle industrielle. Freinez avant les plaques de refroidissement.',
    palette: { sky: '#d6bbae', water: '#8f7f73', ground: '#a08f75', road: '#626665', accent: '#eeb04e' },
    anchors: [[0,-166],[123,-166],[193,-111],[184,-34],[116,1],[53,22],[36,107],[-11,165],[-103,154],[-174,90],[-183,-12],[-139,-112],[-73,-159]],
    zones: [{ kind: 'boost', start: .08, end: .105, offset: 0, width: 10 },
      { kind: 'ice', start: .25, end: .29, offset: -6, width: 8 },
      { kind: 'mud', start: .57, end: .61, offset: 6.5, width: 8 },
      { kind: 'boost', start: .69, end: .715, offset: 0, width: 10 }],
    loops: [{ start: .013, end: .079, height: 27, lateralSpread: 22 }],
    elevations: [{ kind: 'bridge', start: .35, end: .47, height: 5, approach: 50 },
      { kind: 'jump', start: .697, end: .715, height: 2, approach: 0, launchSpeed: 7.6 }],
  }),
  makeTrack({ id: 'castle', name: 'Citadelle royale', theme: 'castle', difficulty: 'Facile', width: 24, grip: 1.02,
    description: 'Un large tour des remparts, un pont de pierre sur les douves et un saut de parade. Les grandes courbes invitent aux dépassements et aux mini-turbos.',
    palette: { sky: '#dbe2ee', water: '#6d9ba8', ground: '#aabd83', road: '#8d9293', accent: '#b18ac8' },
    anchors: [[0,-179],[102,-170],[166,-115],[174,-27],[126,35],[153,107],[98,165],[1,181],[-92,166],[-154,106],[-127,30],[-177,-40],[-150,-130],[-70,-174]],
    zones: [{ kind: 'boost', start: .07, end: .09, offset: -4, width: 10 },
      { kind: 'mud', start: .43, end: .47, offset: 7, width: 8 },
      { kind: 'boost', start: .61, end: .64, offset: 0, width: 10 },
      { kind: 'boost', start: .86, end: .885, offset: 4, width: 10 }],
    elevations: [{ kind: 'bridge', start: .22, end: .35, height: 4, approach: 40 },
      { kind: 'jump', start: .516, end: .536, height: 1.8, approach: 0, launchSpeed: 6.8 }],
  }),
];
export function isTrackId(id: unknown): id is TrackId {
  return typeof id === 'string' && TRACK_IDS.includes(id as TrackId);
}
export function getTrack(id = 'lagon'): TrackDefinition { return TRACKS.find(track => track.id === id) ?? TRACKS[0]!; }
export function trackElevation(progress: number, trackId = 'lagon'): number {
  const track = getTrack(trackId);
  const remainder = progress % track.length;
  const wrapped = remainder < 0 ? remainder + track.length : remainder;
  const loop = track.loops.find(loop => wrapped >= loop.start && wrapped <= loop.end);
  if (loop) return loop.height * Math.sin(Math.PI * (wrapped - loop.start) / (loop.end - loop.start)) ** 2;
  const feature = track.elevations.find(feature => wrapped >= feature.start && wrapped <= feature.end);
  if (!feature) return 0;
  if (feature.kind === 'jump') return feature.height * (wrapped - feature.start) / (feature.end - feature.start);
  const ramp = Math.min(feature.approach, (feature.end - feature.start) / 2);
  const t = Math.max(0, Math.min(1, (wrapped - feature.start) / ramp, (feature.end - wrapped) / ramp));
  return feature.height * t * t * (3 - 2 * t);
}
export function trackSlope(progress: number, trackId = 'lagon'): number {
  const track = getTrack(trackId);
  const remainder = progress % track.length;
  const wrapped = remainder < 0 ? remainder + track.length : remainder;
  const feature = track.elevations.find(feature => wrapped >= feature.start && wrapped <= feature.end);
  if (!feature) return 0;
  if (feature.kind === 'jump') return feature.height / (feature.end - feature.start);
  return (trackElevation(progress + .1, trackId) - trackElevation(progress - .1, trackId)) / .2;
}
/** Ramp geometry only; caller decides speed/direction and crossing of end. */
export function trackJumpAt(progress: number, trackId = 'lagon'): TrackElevation | undefined {
  const track = getTrack(trackId);
  const remainder = progress % track.length;
  const wrapped = remainder < 0 ? remainder + track.length : remainder;
  return track.elevations.find(feature => feature.kind === 'jump' && wrapped >= feature.start && wrapped <= feature.end);
}
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
