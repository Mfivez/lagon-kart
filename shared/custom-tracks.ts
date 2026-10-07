import { TRACKS, MAX_CUSTOM_TRACK_LAPS, makeTrack, registerTrackDefinition, sampleTrackAnchors, type TrackDefinition, type TrackLapEventKind, type TrackId, type TrackZone, type Vec2 } from './track.js';

export interface CustomTrackZone {
  kind: TrackZone['kind'];
  /** Fractions of the closed route, increasing in its driving direction. */
  start: number; end: number;
  /** Metres across the road, measured from the centre line. */
  offset: number; width: number;
}
export interface CustomTrackElevation {
  kind: 'bridge' | 'jump'; start: number; end: number; height: number; approach: number; launchSpeed?: number;
}
export interface CustomTrackLoop { start: number; end: number; height: number; lateralSpread: number }
export interface CustomTrackLapEvent { lap: number; kind: TrackLapEventKind; start: number; end: number }
export const CUSTOM_TRACK_EVENT_KINDS: ReadonlyArray<{id: TrackLapEventKind; label: string}> = [
  {id:'rain',label:'Pluie et flaques'}, {id:'snow',label:'Neige et verglas'}, {id:'ash',label:'Cendres'},
  {id:'storm',label:'Tempête'}, {id:'clear',label:'Éclaircie'}, {id:'boost',label:'Turbo temporaire'},
  {id:'ice',label:'Glace temporaire'}, {id:'mud',label:'Boue temporaire'},
];
export interface CustomTrackDraft {
  name: string; theme: TrackDefinition['theme']; width: number; anchors: Vec2[]; zones: CustomTrackZone[];
  lapCount?: number; elevations?: CustomTrackElevation[]; loops?: CustomTrackLoop[]; events?: CustomTrackLapEvent[];
}
export interface StoredCustomTrack {
  id: string; revision: number; draft: CustomTrackDraft; createdAt: string; updatedAt: string;
  runtimeId?: string; authorId?: string; authorName?: string;
}
export type SavedCustomTrack = StoredCustomTrack;
export interface CustomTrackValidation { ok: boolean; errors: string[]; draft?: CustomTrackDraft; track?: TrackDefinition }
/** Capacity bounds keep untrusted drafts and generated geometry finite; they do not rate the layout. */
export const CUSTOM_TRACK_LIMITS = { minAnchors: 3, maxAnchors: 128, minWidth: 4, maxWidth: 80,
  coordinate: 2000, maxZones: 64, maxLaps: MAX_CUSTOM_TRACK_LAPS, maxElevations: 16, maxLoops: 16, maxEvents: 64, maxHeight: 80 } as const;
export const CUSTOM_TRACK_THEMES: ReadonlyArray<{ id: TrackDefinition['theme']; label: string }> = [
  { id: 'tropical', label: 'Île tropicale' }, { id: 'canyon', label: 'Canyon' }, { id: 'ice', label: 'Banquise' },
  { id: 'neon', label: 'Ville néon' }, { id: 'volcano', label: 'Volcan' }, { id: 'forest', label: 'Forêt' },
  { id: 'harbor', label: 'Port' }, { id: 'sky', label: 'Ciel' }, { id: 'foundry', label: 'Fonderie' },
  { id: 'castle', label: 'Château' },
];
export const CUSTOM_TRACK_TEMPLATES: ReadonlyArray<{ id: string; name: string; draft: CustomTrackDraft }> = [
  { id: 'oval', name: 'Grand ovale', draft: { name: 'Mon grand ovale', theme: 'tropical', width: 22,
    anchors: Array.from({ length: 8 }, (_, index) => ({ x: Math.sin(index * Math.PI / 4) * 170, z: -Math.cos(index * Math.PI / 4) * 110 })),
    zones: [{ kind: 'boost', start: .18, end: .205, offset: 0, width: 8 }] } },
  { id: 'kidney', name: 'Courbes des bois', draft: { name: 'Mes courbes des bois', theme: 'forest', width: 22,
    anchors: [[0,-145],[105,-135],[172,-67],[154,25],[83,79],[32,145],[-60,143],[-132,83],[-107,-8],[-130,-90],[-75,-140]].map(([x,z]) => ({ x: x!, z: z! })),
    zones: [{ kind: 'boost', start: .1, end: .12, offset: 0, width: 8 }, { kind: 'mud', start: .56, end: .59, offset: 6.5, width: 8 }] } },
];

/** The editor and compiler use the exact same closed spline as every built-in circuit. */
export function sampleCustomTrackAnchors(anchors: readonly Vec2[]): Vec2[] {
  if (anchors.length < 3 || anchors.length > CUSTOM_TRACK_LIMITS.maxAnchors ||
    anchors.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.z))) return [];
  return sampleTrackAnchors(anchors);
}
const object = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input);
const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.z - a.z);
function build(draft: CustomTrackDraft, id: TrackId): TrackDefinition {
  const theme = TRACKS.find(track => track.theme === draft.theme)!;
  const track = makeTrack({ id, name: draft.name, description: 'Circuit créé par les joueurs. Trois tours, des objets et votre propre tracé.',
    difficulty: 'Intermédiaire', theme: draft.theme, width: draft.width, grip: theme.grip, palette: { ...theme.palette },
    anchors: draft.anchors.map(({x,z}) => [x,z]), zones: draft.zones.map(zone => ({ ...zone })),
    elevations: draft.elevations?.map(feature=>({...feature})), loops: draft.loops?.map(loop=>({...loop})) });
  // Absent options must stay absent: immutable pre-editor versions keep their
  // complete serialized geometry, description and default three-lap behavior.
  if (draft.lapCount !== undefined) {
    track.lapCount = draft.lapCount;
    track.description = `Circuit créé par les joueurs. ${draft.lapCount} ${draft.lapCount === 1 ? 'tour' : 'tours'}, des objets et votre propre tracé.`;
  }
  if (draft.events !== undefined) track.lapEvents = draft.events.map((event,index)=>({...event,id:`${id}-lap-event-${index}`,start:event.start*track.length,end:event.end*track.length}));
  return track;
}

/** No registration or mutation: safe on every editor change and on untrusted HTTP input. */
export function validateCustomTrackDraft(input: unknown): CustomTrackValidation {
  const errors: string[] = [];
  if (!object(input)) return { ok: false, errors: ['Le circuit doit contenir un nom, un thème et des points.'] };
  const name = typeof input.name === 'string' ? input.name.normalize('NFC').trim() : '';
  if (name.length < 2 || name.length > 48 || /[\u0000-\u001f\u007f]/.test(name)) errors.push('Donnez un nom de 2 à 48 caractères au circuit.');
  if (!CUSTOM_TRACK_THEMES.some(theme => theme.id === input.theme)) errors.push('Choisissez un thème de décor proposé.');
  if (!finite(input.width) || input.width < CUSTOM_TRACK_LIMITS.minWidth || input.width > CUSTOM_TRACK_LIMITS.maxWidth) errors.push(`La largeur doit être comprise entre ${CUSTOM_TRACK_LIMITS.minWidth} et ${CUSTOM_TRACK_LIMITS.maxWidth} m.`);
  const anchors: Vec2[] = [];
  if (!Array.isArray(input.anchors) || input.anchors.length < CUSTOM_TRACK_LIMITS.minAnchors || input.anchors.length > CUSTOM_TRACK_LIMITS.maxAnchors)
    errors.push(`Placez entre ${CUSTOM_TRACK_LIMITS.minAnchors} et ${CUSTOM_TRACK_LIMITS.maxAnchors} points pour fermer le circuit.`);
  else for (const point of input.anchors) {
    if (!object(point) || !finite(point.x) || !finite(point.z) || Math.abs(point.x) > CUSTOM_TRACK_LIMITS.coordinate || Math.abs(point.z) > CUSTOM_TRACK_LIMITS.coordinate) {
      errors.push(`Les coordonnées doivent être des nombres finis dans la zone de dessin (${CUSTOM_TRACK_LIMITS.coordinate} m autour du centre).`); break;
    }
    anchors.push({ x: point.x, z: point.z });
  }
  if (anchors.length > 0 && !anchors.some(point => distance(point, anchors[0]!) > 1e-6))
    errors.push('Déplacez au moins un point : le circuit ne peut pas être entièrement réduit à un point.');
  const zones: CustomTrackZone[] = [];
  if (!Array.isArray(input.zones) || input.zones.length > CUSTOM_TRACK_LIMITS.maxZones) errors.push(`Ajoutez au maximum ${CUSTOM_TRACK_LIMITS.maxZones} zones turbo, glace ou boue.`);
  else for (let index = 0; index < input.zones.length; index++) {
    const zone = input.zones[index];
    if (!object(zone) || typeof zone.kind !== 'string' || !['boost','ice','mud'].includes(zone.kind) || !finite(zone.start) || !finite(zone.end) ||
      zone.start < 0 || zone.end > 1 || zone.end <= zone.start ||
      !finite(zone.offset) || !finite(zone.width) || zone.width <= 0 || !finite(input.width) || Math.abs(zone.offset) + zone.width / 2 > input.width / 2 + 1e-6) {
      errors.push(`Zone ${index + 1} : placez une bande de largeur positive dans la route, entre 0 % et 100 % du tour.`); continue;
    }
    zones.push({ kind: zone.kind as TrackZone['kind'], start: zone.start, end: zone.end, offset: zone.offset, width: zone.width });
  }
  const lapCount = input.lapCount === undefined ? 3 : input.lapCount;
  if (!Number.isInteger(lapCount) || !finite(lapCount) || lapCount < 1 || lapCount > CUSTOM_TRACK_LIMITS.maxLaps)
    errors.push(`Choisissez entre 1 et ${CUSTOM_TRACK_LIMITS.maxLaps} tours.`);
  const interval = (value: Record<string,unknown>) => finite(value.start) && finite(value.end) && value.start >= 0 && value.end <= 1 && value.start < value.end;
  const elevations: CustomTrackElevation[] = [];
  if (input.elevations !== undefined) {
    if (!Array.isArray(input.elevations) || input.elevations.length > CUSTOM_TRACK_LIMITS.maxElevations) errors.push(`Ajoutez au maximum ${CUSTOM_TRACK_LIMITS.maxElevations} ponts et tremplins.`);
    else for (const [index,value] of input.elevations.entries()) {
      if (!object(value) || !['bridge','jump'].includes(String(value.kind)) || !interval(value) || !finite(value.height) || value.height <= 0 || value.height > CUSTOM_TRACK_LIMITS.maxHeight ||
        !finite(value.approach) || value.approach < 0 || value.approach > 2000 || value.kind === 'bridge' && value.approach <= 0 ||
        value.launchSpeed !== undefined && (!finite(value.launchSpeed) || value.launchSpeed < 0 || value.launchSpeed > 25)) {
        errors.push(`Relief ${index+1} : placez un pont ou un tremplin entre 0 % et 100 %, avec une hauteur positive de 80 m maximum et une approche positive pour un pont.`); continue;
      }
      elevations.push({kind:value.kind as CustomTrackElevation['kind'],start:value.start as number,end:value.end as number,height:value.height,approach:value.approach,
        ...(value.launchSpeed === undefined ? {} : {launchSpeed:value.launchSpeed as number})});
    }
  }
  const loops: CustomTrackLoop[] = [];
  if (input.loops !== undefined) {
    if (!Array.isArray(input.loops) || input.loops.length > CUSTOM_TRACK_LIMITS.maxLoops) errors.push(`Ajoutez au maximum ${CUSTOM_TRACK_LIMITS.maxLoops} loopings.`);
    else for (const [index,value] of input.loops.entries()) {
      if (!object(value) || !interval(value) || !finite(value.height) || value.height <= 0 || value.height > CUSTOM_TRACK_LIMITS.maxHeight ||
        !finite(value.lateralSpread) || value.lateralSpread < 0 || value.lateralSpread > 80) {
        errors.push(`Looping ${index+1} : gardez une hauteur positive de 80 m maximum, un écart latéral de 0 à 80 m et une position entre 0 % et 100 %.`); continue;
      }
      loops.push({start:value.start as number,end:value.end as number,height:value.height,lateralSpread:value.lateralSpread});
    }
  }
  const lapEvents: CustomTrackLapEvent[] = [];
  if (input.events !== undefined) {
    if (!Array.isArray(input.events) || input.events.length > CUSTOM_TRACK_LIMITS.maxEvents) errors.push(`Ajoutez au maximum ${CUSTOM_TRACK_LIMITS.maxEvents} événements.`);
    else for (const [index,value] of input.events.entries()) {
      if (!object(value) || !Number.isInteger(value.lap) || !finite(value.lap) || value.lap < 1 || !finite(lapCount) || value.lap > lapCount ||
        !CUSTOM_TRACK_EVENT_KINDS.some(kind=>kind.id===value.kind) || !interval(value)) {
        errors.push(`Événement ${index+1} : choisissez un tour de la course, un effet et une portion entre 0 % et 100 %.`); continue;
      }
      lapEvents.push({lap:value.lap,kind:value.kind as TrackLapEventKind,start:value.start as number,end:value.end as number});
    }
  }
  if (errors.length) return { ok: false, errors };
  const draft: CustomTrackDraft = { name, theme: input.theme as CustomTrackDraft['theme'], width: input.width as number, anchors, zones,
    ...(input.lapCount === undefined ? {} : {lapCount:lapCount as number}),
    ...(input.elevations === undefined ? {} : {elevations}), ...(input.loops === undefined ? {} : {loops}),
    ...(input.events === undefined ? {} : {events:lapEvents}) };
  const track = build(draft, 'custom-preview-v1');
  // Coincident local anchors and crossings are intentional creative choices. Keep
  // the historical spline untouched so existing published revisions never move.
  if (!(track.length > 1e-6) || !Number.isFinite(track.length) ||
    track.checkpoints.some(point => !Number.isFinite(point.x + point.z + point.angle)))
    errors.push('Le circuit doit contenir une route de longueur non nulle.');
  return { ok: errors.length === 0, errors, draft, track };
}
export function customTrackRuntimeId(record: Pick<StoredCustomTrack, 'id' | 'revision'>): TrackId {
  if (!/^custom-[a-z0-9-]{1,64}$/.test(record.id) || !Number.isInteger(record.revision) || record.revision < 1 || record.revision > 10000)
    throw new Error('Identifiant ou version de circuit personnalisé invalide.');
  return `${record.id}-v${record.revision}` as TrackId;
}
/** Persistence may retain a historical reference even if its source file needs repair. */
export function isCustomTrackRuntimeId(id: unknown): id is `custom-${string}-v${number}` {
  if (typeof id !== 'string') return false;
  const match = /^(custom-[a-z0-9-]{1,64})-v([1-9][0-9]{0,4})$/.exec(id);
  return !!match && Number(match[2]) <= 10000;
}
export function compileCustomTrack(record: StoredCustomTrack): TrackDefinition {
  const id = customTrackRuntimeId(record), validation = validateCustomTrackDraft(record.draft);
  if (!validation.ok || !validation.draft) throw new Error(validation.errors.join(' '));
  return build(validation.draft, id);
}
export function registerCustomTrack(record: StoredCustomTrack): TrackDefinition {
  return registerTrackDefinition(compileCustomTrack(record), record.id, record.revision);
}
