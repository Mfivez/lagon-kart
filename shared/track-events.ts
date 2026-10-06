import { getTrack, nearestTrack, trackPoint, trackSurface, type Surface, type TrackZone, type Vec2 } from './track.js';

export type EventLevel = 0 | 1 | 2 | 3;
export type EventStage = 0 | 1 | 2;
export type BranchKind = 'detour' | 'technical' | 'shortcut';
export interface BranchPoint extends Vec2 { progress: number; angle: number }
export interface EventCheckpointGate extends BranchPoint { width: number; branchId: string }
export interface TrackBranch {
  id: string; name: string; kind: BranchKind; start: number; end: number;
  width: number; length: number; points: BranchPoint[]; open: boolean;
}
export interface TrackBlocker extends Vec2 {
  id: string; angle: number; halfLength: number; halfWidth: number;
}
export interface TrackEventInfo {
  trackId: string; stage: EventStage; level: EventLevel; title: string; description: string;
  weather: 'clear' | 'rain' | 'snow' | 'ash' | 'storm';
  branches: TrackBranch[]; blockers: TrackBlocker[];
}
export type DriveablePosition = ReturnType<typeof nearestTrack> & {
  width: number; branchId: string; surface: Surface;
};
const layouts = new Map<string, { branches: TrackBranch[]; blocker: TrackBlocker }>();
const events = new Map<string, TrackEventInfo>();
const clampLevel = (value: number): EventLevel => Math.max(0, Math.min(3, Math.floor(Number.isFinite(value) ? value : 0))) as EventLevel;
const clampStage = (value: number): EventStage => Math.max(0, Math.min(2, Math.floor(Number.isFinite(value) ? value : 0))) as EventStage;

function branch(trackId: string, gate: number, kind: BranchKind, offset: number, width: number): TrackBranch {
  const track = getTrack(trackId);
  const start = gate * track.length / 12 + 6, end = (gate + 1) * track.length / 12 - 6;
  const points = Array.from({ length: 49 }, (_, index) => {
    const t = index / 48, progress = start + (end - start) * t;
    const point = trackPoint(progress, trackId), distance = Math.sin(t * Math.PI) ** 2 * offset;
    return { x: point.x + Math.cos(point.angle) * distance,
      z: point.z - Math.sin(point.angle) * distance, progress, angle: point.angle };
  });
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    a.angle = Math.atan2(b.x - a.x, b.z - a.z);
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return { id: trackId + '-' + kind, name: kind === 'detour' ? 'Déviation · objets' : kind === 'technical' ? 'Turbo givré' : 'Passage expert',
    kind, start, end, width, length, points, open: true };
}

function layout(trackId: string) {
  const track = getTrack(trackId);
  const cached = layouts.get(track.id);
  if (cached) return cached;
  // Choose straighter checkpoint intervals: the branches remain distinct while
  // their offset curves keep a generous turn radius and never skip a gate.
  const straightest = (gates: number[]) => gates.sort((a, b) => {
    const curvature = (gate: number) => {
      const start = trackPoint(gate * track.length / 12 + 6, track.id);
      const end = trackPoint((gate + 1) * track.length / 12 - 6, track.id);
      return (track.length / 12 - 12) / Math.hypot(end.x - start.x, end.z - start.z);
    };
    return curvature(a) - curvature(b) || a - b;
  })[0]!;
  const gate = straightest([2, 3, 4, 5]);
  const detour = branch(track.id, gate, 'detour', 25, 9);
  const shortcut = branch(track.id, gate, 'shortcut', -19, 5.5);
  const technical = branch(track.id, straightest([7, 8, 9, 10]), 'technical', 18, 6);
  const middle = trackPoint((detour.start + detour.end) / 2, track.id);
  const result = { branches: [detour, technical, shortcut],
    blocker: { id: track.id + '-collapse', x: middle.x, z: middle.z, angle: middle.angle,
      halfLength: 2.6, halfWidth: track.width / 2 + 5.5 } };
  layouts.set(track.id, result);
  return result;
}

/** Shared phase comes from the leader's lap, never from an individual client. */
export function getTrackEvent(trackId: string, stage = 0, level = 0): TrackEventInfo {
  const track = getTrack(trackId), currentStage = clampStage(stage), currentLevel = clampLevel(level);
  const key = [track.id, currentStage, currentLevel].join(':');
  const cached = events.get(key);
  if (cached) return cached;
  const active = currentLevel >= 2 && currentStage >= 1;
  const name = track.theme === 'ice' ? 'Avalanche' : track.theme === 'canyon' ? 'Éboulement' : track.theme === 'neon' ? 'Route coupée' : 'Inondation';
  const result: TrackEventInfo = { trackId: track.id, stage: currentStage, level: currentLevel,
    title: currentLevel === 0 ? 'Circuit classique' : active ? currentStage === 2 ? name + ' · passage expert ouvert' : name + ' · suivez la déviation'
      : currentStage === 2 ? 'Passage expert ouvert' : 'Choisissez votre route',
    description: currentLevel === 0 ? 'La piste reste identique pendant les trois tours.' : active
      ? currentStage === 2 ? 'La route principale reste barrée. Le passage intérieur étroit est ouvert ; la déviation large reste disponible.'
        : 'Une section de la route est barrée pour tous les pilotes. La voie extérieure large contourne les débris.'
      : currentStage === 2 ? 'Un passage intérieur étroit s’ouvre. La route normale, la déviation et Turbo givré restent disponibles.'
        : 'La déviation large donne des objets ; Turbo givré combine accélération et faible adhérence.',
    weather: active ? currentLevel === 3 && currentStage === 2 ? 'storm' : track.theme === 'ice' ? 'snow' : track.theme === 'canyon' ? 'ash' : 'rain' : 'clear',
    branches: currentLevel === 0 ? [] : layout(track.id).branches.map(route => ({ ...route,
      open: route.kind !== 'shortcut' || currentStage >= 2 })),
    blockers: active ? [layout(track.id).blocker] : [] };
  events.set(key, result);
  return result;
}

function branchSurface(route: TrackBranch, progress: number): Surface {
  const t = (progress - route.start) / (route.end - route.start);
  if (route.kind === 'technical') return t < .3 ? 'boost' : t < .83 ? 'ice' : 'road';
  if (route.kind === 'shortcut') return t > .12 && t < .55 ? 'boost' : 'road';
  return t > .48 && t < .64 ? 'mud' : 'road';
}

export function nearestDriveableTrack(x: number, z: number, trackId: string, stage = 0, level = 0): DriveablePosition {
  const track = getTrack(trackId), base = nearestTrack(x, z, track.id);
  let result: DriveablePosition = { ...base, width: track.width, branchId: '', surface: trackSurface(x, z, track.id, base).surface };
  // Keep the main surface where ribbons join, unless the branch centre is closer.
  for (const route of getTrackEvent(track.id, stage, level).branches) {
    if (!route.open) continue;
    for (let index = 0; index < route.points.length - 1; index++) {
      const a = route.points[index]!, b = route.points[index + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const fraction = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * fraction, pz = a.z + dz * fraction, distance = Math.hypot(x - px, z - pz);
      const inside = distance <= route.width / 2, resultInside = result.distance <= result.width / 2;
      // The driveable area is the union of road ribbons. A nearby narrow branch
      // cannot turn the outer lane of the wider main road into offroad terrain.
      if ((!inside && resultInside) || (inside === resultInside && distance >= result.distance)) continue;
      const progress = a.progress + (b.progress - a.progress) * fraction;
      result = { x: px, z: pz, distance, progress, index, angle: a.angle, width: route.width,
        branchId: route.id, surface: distance <= route.width / 2 ? branchSurface(route, progress) : 'offroad' };
    }
  }
  return result;
}

export function dynamicSurface(x: number, z: number, trackId: string, stage = 0, level = 0,
  near = nearestDriveableTrack(x, z, trackId, stage, level)): { surface: Surface; zone?: TrackZone } {
  const track = getTrack(trackId), event = getTrackEvent(track.id, stage, level);
  if (near.branchId) {
    const route = event.branches.find(candidate => candidate.id === near.branchId)!;
    return { surface: near.surface, zone: near.surface === 'boost' ? {
      id: route.id + '-boost', kind: 'boost', start: route.start, end: route.end, offset: 0, width: route.width,
    } : undefined };
  }
  const contact = trackSurface(x, z, track.id, near);
  if (event.level < 2 || event.stage < 1 || contact.surface !== 'road') return contact;
  const fraction = near.progress / track.length;
  if ((fraction > .51 && fraction < .565) || (event.level === 3 && event.stage === 2 && fraction > .86 && fraction < .90))
    return { surface: track.theme === 'ice' ? 'ice' : 'mud' };
  return contact;
}

/** Ordinary CPU guidance; progress is still earned by crossing the real gates. */
export function eventRoutePoint(progress: number, trackId: string, stage = 0, level = 0): Vec2 & { angle: number } {
  const track = getTrack(trackId), event = getTrackEvent(track.id, stage, level);
  const wrapped = ((progress % track.length) + track.length) % track.length;
  if (event.blockers.length) {
    const route = event.branches.find(candidate => candidate.kind === 'detour')!;
    if (wrapped >= route.start && wrapped <= route.end) return pointOnBranch(route, wrapped);
  }
  return trackPoint(wrapped, track.id);
}

export function pointOnBranch(route: TrackBranch, progress: number): Vec2 & { angle: number } {
  const value = Math.max(0, Math.min(route.points.length - 1, (progress - route.start) / (route.end - route.start) * (route.points.length - 1)));
  const index = Math.min(route.points.length - 2, Math.floor(value)), fraction = value - index;
  const a = route.points[index]!, b = route.points[index + 1]!;
  return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, angle: a.angle };
}

/** Physical alternatives for one ordered checkpoint, never a free progress grant. */
export function eventCheckpointGates(trackId: string, checkpointIndex: number, stage = 0, level = 0): EventCheckpointGate[] {
  const track = getTrack(trackId), checkpoint = track.checkpoints[checkpointIndex];
  if (!checkpoint) return [];
  const gates: EventCheckpointGate[] = [{ ...checkpoint, width: track.width, branchId: '' }];
  for (const route of getTrackEvent(track.id, stage, level).branches) if (route.open && checkpoint.progress > route.start && checkpoint.progress < route.end)
    gates.push({ ...pointOnBranch(route, checkpoint.progress), progress: checkpoint.progress, width: route.width, branchId: route.id });
  return gates;
}

export function trackEventPickups(trackId: string, stage = 0, level = 0): Array<Vec2 & { id: string; cooldown: number }> {
  const route = getTrackEvent(trackId, stage, level).branches.find(candidate => candidate.kind === 'detour');
  if (!route) return [];
  return [.36, .76].map((fraction, index) => ({ ...pointOnBranch(route, route.start + (route.end - route.start) * fraction),
    id: route.id + '-pickup-' + index, cooldown: 0 }));
}

/** Swept rectangle collision: even a boosted frame cannot jump the barricade. */
export function constrainTrackEvent(x: number, z: number, previousX: number, previousZ: number, speed: number,
  trackId: string, stage = 0, level = 0): { x: number; z: number; speed: number; blocked: boolean } {
  for (const blocker of getTrackEvent(trackId, stage, level).blockers) {
    const sine = Math.sin(blocker.angle), cosine = Math.cos(blocker.angle);
    const local = (px: number, pz: number) => ({ along: (px - blocker.x) * sine + (pz - blocker.z) * cosine,
      across: (px - blocker.x) * cosine - (pz - blocker.z) * sine });
    const a = local(previousX, previousZ), b = local(x, z);
    const halfLength = blocker.halfLength + .95, halfWidth = blocker.halfWidth + .95;
    if (Math.abs(a.along) < halfLength && Math.abs(a.across) < halfWidth) {
      // A phase can change while a kart occupies this tile. Eject to the closest
      // longitudinal face, instead of trapping the kart inside the new debris.
      const along = Math.sign(a.along || b.along || 1) * (halfLength + .05);
      return { x: blocker.x + sine * along + cosine * a.across,
        z: blocker.z + cosine * along - sine * a.across, speed: 0, blocked: true };
    }
    let entry = 0, exit = 1;
    for (const [start, end, limit] of [[a.along, b.along, halfLength], [a.across, b.across, halfWidth]]) {
      const delta = end - start;
      if (Math.abs(delta) < 1e-9) { if (Math.abs(start) > limit) { entry = 2; break; } continue; }
      const first = (-limit - start) / delta, second = (limit - start) / delta;
      entry = Math.max(entry, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
    }
    if (entry <= exit && entry >= 0 && entry <= 1) {
      const fraction = Math.max(0, entry - .002);
      return { x: previousX + (x - previousX) * fraction, z: previousZ + (z - previousZ) * fraction, speed: 0, blocked: true };
    }
  }
  return { x, z, speed, blocked: false };
}
