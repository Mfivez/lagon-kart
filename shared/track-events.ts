import { getTrack, nearestTrack, trackPoint, trackSurface, trackElevation, type Surface, type TrackZone, type Vec2 } from './track.js';
import { KART_COLLISION_HEIGHT, trackBlockerHeight } from './obstacle-heights.js';

export type EventLevel = 0 | 1 | 2 | 3;
export type EventStage = 0 | 1 | 2;
export type BranchKind = 'detour' | 'technical' | 'shortcut';
export interface BranchPoint extends Vec2 { progress: number; angle: number }
export interface EventCheckpointGate extends BranchPoint { width: number; branchId: string }
export interface TrackBranch {
  id: string; name: string; kind: BranchKind; start: number; end: number;
  width: number; length: number; minTurnRadius: number; points: BranchPoint[]; open: boolean;
}
export interface TrackBlocker extends Vec2 {
  id: string; angle: number; halfLength: number; halfWidth: number; elevation: number; height: number;
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

function branch(trackId: string, start: number, end: number, kind: BranchKind, handle: number, bow: number, width: number): TrackBranch {
  const a = trackPoint(start, trackId), b = trackPoint(end, trackId);
  const chord = Math.hypot(b.x - a.x, b.z - a.z), normal = { x: (b.z - a.z) / chord, z: -(b.x - a.x) / chord };
  const first = { x: a.x + Math.sin(a.angle) * chord * handle, z: a.z + Math.cos(a.angle) * chord * handle };
  const last = { x: b.x - Math.sin(b.angle) * chord * handle, z: b.z - Math.cos(b.angle) * chord * handle };
  const points = Array.from({ length: 97 }, (_, index) => {
    const t = index / 96, u = 1 - t, offset = 16 * t * t * u * u * bow;
    return { x: u ** 3 * a.x + 3 * u * u * t * first.x + 3 * u * t * t * last.x + t ** 3 * b.x + normal.x * offset,
      z: u ** 3 * a.z + 3 * u * u * t * first.z + 3 * u * t * t * last.z + t ** 3 * b.z + normal.z * offset,
      progress: 0, angle: b.angle };
  });
  let length = 0, maximumCurvature = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    a.angle = Math.atan2(b.x - a.x, b.z - a.z);
    length += Math.hypot(b.x - a.x, b.z - a.z);
    b.progress = length;
    if (i + 2 < points.length) {
      const c = points[i + 2]!, ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
      maximumCurvature = Math.max(maximumCurvature, 2 * Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) / (ab * bc * ac));
    }
  }
  for (const point of points) point.progress = start + point.progress / length * (end - start);
  return { id: trackId + '-' + kind, name: kind === 'detour' ? 'Déviation large' : kind === 'technical' ? 'Voie turbo' : 'Raccourci',
    kind, start, end, width, length, minTurnRadius: 1 / maximumCurvature, points, open: true };
}

function layout(trackId: string) {
  const track = getTrack(trackId);
  const cached = layouts.get(track.id);
  if (cached) return cached;
  const width = track.width >= 20 ? 14 : 12;
  const candidates: Array<{ detour: TrackBranch; shortcut: TrackBranch; blocker: TrackBlocker; score: number }> = [];
  const outward = (start: number, end: number, kind: BranchKind, handle: number) => {
    const base = branch(track.id, start, end, kind, handle, 0, width);
    const a = base.points[0]!, b = base.points.at(-1)!, middle = trackPoint((start + end) / 2, track.id), mid = base.points[48]!;
    const chord = Math.hypot(b.x - a.x, b.z - a.z);
    const bow = ((middle.x - mid.x) * (b.z - a.z) - (middle.z - mid.z) * (b.x - a.x)) / chord + track.width / 2 + 18;
    return branch(track.id, start, end, kind, handle, bow, width);
  };
  const safeSector = (route: TrackBranch) => !track.loops.some(loop => route.start < loop.end + 8 && route.end > loop.start - 8) && route.points.every((point, index) => {
    if (index % 4) return true;
    const near = nearestTrack(point.x, point.z, track.id);
    return near.progress >= route.start - 18 && near.progress <= route.end + 18;
  });
  // Long Bézier transitions preserve the road's entry/exit tangents. Candidate
  // selection favours broad turns and a real geometric shortcut, never a turbo
  // used to disguise a longer, hairpin-shaped route.
  for (const span of [3, 4, 5]) for (let gate = 1; gate + span <= 11; gate++) {
    const start = gate * track.length / 12 + 8, end = (gate + span) * track.length / 12 - 8;
    for (const handle of [.24, .28, .32, .36]) {
      const shortcut = branch(track.id, start, end, 'shortcut', handle, 0, width);
      const gain = 1 - shortcut.length / (end - start);
      if (gain < .05 || shortcut.minTurnRadius < 25 || !safeSector(shortcut)) continue;
      for (const outerHandle of [.38, .44, .5]) {
        const detour = outward(start, end, 'detour', outerHandle);
        if (detour.minTurnRadius < 28 || detour.length > (end - start) * 1.22 || !safeSector(detour)) continue;
        let blocker: TrackBlocker | undefined, clearance = -Infinity;
        for (const fraction of [.3, .4, .5, .6, .7]) {
          const point = trackPoint(start + (end - start) * fraction, track.id);
          const candidate = { id: track.id + '-collapse', x: point.x, z: point.z, angle: point.angle,
            halfLength: 2.6, halfWidth: track.width / 2 + 5.5,
            elevation: trackElevation(start + (end - start) * fraction, track.id), height: trackBlockerHeight(track.id) };
          let space = Infinity;
          for (const route of [detour, shortcut]) for (const sample of route.points) {
            const along = (sample.x - point.x) * Math.sin(point.angle) + (sample.z - point.z) * Math.cos(point.angle);
            if (Math.abs(along) > candidate.halfLength + width / 2 + 2) continue;
            const across = Math.abs((sample.x - point.x) * Math.cos(point.angle) - (sample.z - point.z) * Math.sin(point.angle));
            space = Math.min(space, across - candidate.halfWidth - width / 2 - 1);
          }
          if (space > clearance) { clearance = space; blocker = candidate; }
        }
        if (!blocker || clearance < .5) continue;
        const score = Math.min(shortcut.minTurnRadius, 45) * .003 + gain * .6 - Math.max(0, detour.length / (end - start) - 1) * .2;
        candidates.push({ detour, shortcut, blocker, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0];
  if (!chosen) throw new Error('Aucune bifurcation fluide et sûre pour le circuit ' + track.id);
  const { detour, shortcut, blocker } = chosen;
  const alternatives: TrackBranch[] = [];
  for (const span of [3, 4]) for (let gate = 1; gate + span <= 11; gate++) {
    const start = gate * track.length / 12 + 8, end = (gate + span) * track.length / 12 - 8;
    if (start < detour.end + 10 && end > detour.start - 10) continue;
    for (const handle of [.38, .44, .5]) {
      const candidate = outward(start, end, 'technical', handle);
      if (candidate.minTurnRadius >= 20 && safeSector(candidate)) alternatives.push(candidate);
    }
  }
  alternatives.sort((a, b) => b.minTurnRadius - a.minTurnRadius);
  const technical = alternatives[0];
  if (!technical) throw new Error('Aucune voie secondaire fluide pour le circuit ' + track.id);
  const result = { branches: [detour, technical, shortcut], blocker };
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
  const name = track.theme === 'ice' ? 'Avalanche' : track.theme === 'canyon' ? 'Éboulement'
    : track.theme === 'volcano' ? 'Coulée volcanique' : track.theme === 'sky' ? 'Tempête'
      : track.theme === 'foundry' ? 'Incident industriel' : track.theme === 'castle' ? 'Pont coupé'
        : track.theme === 'neon' ? 'Route coupée' : 'Inondation';
  const result: TrackEventInfo = { trackId: track.id, stage: currentStage, level: currentLevel,
    title: currentLevel === 0 ? 'Circuit classique' : active ? currentStage === 2 ? name + ' · raccourci ouvert' : name + ' · suivez la déviation'
      : currentStage === 2 ? 'Raccourci ouvert' : 'Choisissez votre route',
    description: currentLevel === 0 ? 'La piste reste identique pendant les trois tours.' : active
      ? currentStage === 2 ? 'La route principale reste barrée. Le raccourci intérieur, plus court que la route normale, est ouvert.'
        : 'Une section de la route est barrée pour tous les pilotes. La voie extérieure large contourne les débris.'
      : currentStage === 2 ? 'Un raccourci large s’ouvre. La route normale, la déviation et la voie turbo restent disponibles.'
        : 'La déviation large donne des objets ; la voie turbo offre une accélération avec une courte zone glissante annoncée.',
    weather: active ? currentLevel === 3 && currentStage === 2 ? 'storm' : track.theme === 'ice' ? 'snow'
      : ['canyon', 'volcano', 'foundry'].includes(track.theme) ? 'ash' : 'rain' : 'clear',
    branches: currentLevel === 0 ? [] : layout(track.id).branches.map(route => ({ ...route,
      open: route.kind !== 'shortcut' || currentStage >= 2 })),
    blockers: active ? [layout(track.id).blocker] : [] };
  events.set(key, result);
  return result;
}

/** A rail opening exists only for a branch actually open in the current race. */
export function trackBoundaryGap(x: number, z: number, trackId: string, stage = 0, level = 0): boolean {
  return getTrackEvent(trackId, stage, level).branches.some(branch => branch.open && branch.points.some(point =>
    Math.hypot(point.x - x, point.z - z) < branch.width / 2 + 2));
}

function branchSurface(route: TrackBranch, progress: number): Surface {
  const t = (progress - route.start) / (route.end - route.start);
  if (route.kind === 'technical') return t > .2 && t < .35 ? 'boost' : t > .6 && t < .7 ? 'ice' : 'road';
  return 'road';
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
  const value = Math.max(route.start, Math.min(route.end, progress));
  let low = 0, high = route.points.length - 2;
  while (low < high) { const middle = (low + high) >>> 1; if (route.points[middle + 1]!.progress < value) low = middle + 1; else high = middle; }
  const a = route.points[low]!, b = route.points[low + 1]!, fraction = (value - a.progress) / (b.progress - a.progress);
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

/** Swept finite box: fast motion is blocked only while its vertical span overlaps. */
export function constrainTrackEvent(x: number, z: number, previousX: number, previousZ: number, speed: number,
  trackId: string, stage = 0, level = 0, vertical?: { previous: number; current: number }): { x: number; z: number; speed: number; blocked: boolean } {
  for (const blocker of getTrackEvent(trackId, stage, level).blockers) {
    const sine = Math.sin(blocker.angle), cosine = Math.cos(blocker.angle);
    const local = (px: number, pz: number) => ({ along: (px - blocker.x) * sine + (pz - blocker.z) * cosine,
      across: (px - blocker.x) * cosine - (pz - blocker.z) * sine });
    const a = local(previousX, previousZ), b = local(x, z);
    const halfLength = blocker.halfLength + .95, halfWidth = blocker.halfWidth + .95;
    const fromY = vertical?.previous ?? blocker.elevation, toY = vertical?.current ?? blocker.elevation;
    const bottom = blocker.elevation - KART_COLLISION_HEIGHT, top = blocker.elevation + blocker.height;
    if (Math.abs(a.along) < halfLength && Math.abs(a.across) < halfWidth && toY < top && toY > bottom) {
      // A phase can change while a kart occupies this tile. Eject to the closest
      // longitudinal face, instead of trapping the kart inside the new debris.
      const along = Math.sign(a.along || b.along || 1) * (halfLength + .05);
      return { x: blocker.x + sine * along + cosine * a.across,
        z: blocker.z + cosine * along - sine * a.across, speed: 0, blocked: true };
    }
    let entry = 0, exit = 1;
    for (const [start, end, low, high] of [[a.along, b.along, -halfLength, halfLength], [a.across, b.across, -halfWidth, halfWidth], [fromY, toY, bottom, top]]) {
      const delta = end - start;
      if (Math.abs(delta) < 1e-9) { if (start < low || start > high) { entry = 2; break; } continue; }
      const first = (low - start) / delta, second = (high - start) / delta;
      entry = Math.max(entry, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
    }
    if (entry <= exit && entry >= 0 && entry <= 1) {
      const fraction = Math.max(0, entry - .002);
      return { x: previousX + (x - previousX) * fraction, z: previousZ + (z - previousZ) * fraction, speed: 0, blocked: true };
    }
  }
  return { x, z, speed, blocked: false };
}
