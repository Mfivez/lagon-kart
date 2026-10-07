import { getTrack, nearestTrack, trackElevation, trackPoint, type TrackLoop } from './track.js';

export interface LoopVector { x: number; y: number; z: number }
export interface TrackLoopPose extends LoopVector {
  angle: number; pitch: number; right: LoopVector; up: LoopVector; tangent: LoopVector;
  active: boolean; loopId: string; fraction: number;
  /** Logical road metres per real metre travelled on the three-dimensional rail. */
  speedScale: number;
}
const normalize = (v: LoopVector): LoopVector => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
export function trackLoopAt(progress: number, trackId: string): TrackLoop | undefined {
  const track = getTrack(trackId), remainder = progress % track.length;
  const wrapped = remainder < 0 ? remainder + track.length : remainder;
  return track.loops.find(loop => wrapped >= loop.start && wrapped <= loop.end);
}

function centre(progress: number, trackId: string, loop: TrackLoop): LoopVector {
  const entry = trackPoint(loop.start, trackId), exit = trackPoint(loop.end, trackId);
  const u = Math.max(0, Math.min(1, (progress - loop.start) / (loop.end - loop.start)));
  const span = loop.end - loop.start;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  // An analytic Hermite centreline avoids the tiny tangent steps in the road's
  // sampled Catmull–Rom polyline from introducing abrupt bank changes.
  const point = { x: h00 * entry.x + h10 * span * Math.sin(entry.angle) + h01 * exit.x + h11 * span * Math.sin(exit.angle),
    z: h00 * entry.z + h10 * span * Math.cos(entry.angle) + h01 * exit.z + h11 * span * Math.cos(exit.angle) };
  // The outward and returning roads are separated laterally. A planar circle
  // with different entry/exit positions would intersect itself at its base.
  // Both offsets and their first derivatives vanish at the road joins.
  const wave = Math.sin(2 * Math.PI * u);
  const along = (loop.end - loop.start) * .31 * Math.sin(Math.PI * u) ** 2 * wave;
  const sideways = loop.lateralSpread * Math.sin(Math.PI * u) ** 2 * wave;
  return { x: point.x + Math.sin(entry.angle) * along + Math.cos(entry.angle) * sideways,
    y: loop.height * Math.sin(Math.PI * u) ** 2,
    z: point.z + Math.cos(entry.angle) * along - Math.sin(entry.angle) * sideways };
}

/** The shared road coordinate stays monotone even when the real rail folds
 * backwards overhead. Gates, prediction and authoritative state use that one
 * coordinate; rendering and physical distances use this deterministic pose. */
export function trackLoopPose(progress: number, trackId: string, lateral = 0): TrackLoopPose {
  const point = trackPoint(progress, trackId), loop = trackLoopAt(progress, trackId);
  if (!loop) return { x: point.x + Math.cos(point.angle) * lateral,
    y: trackElevation(progress, trackId), z: point.z - Math.sin(point.angle) * lateral,
    angle: point.angle, pitch: 0, right: { x: Math.cos(point.angle), y: 0, z: -Math.sin(point.angle) },
    up: { x: 0, y: 1, z: 0 }, tangent: { x: Math.sin(point.angle), y: 0, z: Math.cos(point.angle) },
    speedScale: 1, active: false, loopId: '', fraction: 0 };
  const wrapped = (progress % getTrack(trackId).length + getTrack(trackId).length) % getTrack(trackId).length;
  const fraction = (wrapped - loop.start) / (loop.end - loop.start), position = centre(wrapped, trackId, loop);
  const before = centre(Math.max(loop.start, wrapped - .01), trackId, loop);
  const after = centre(Math.min(loop.end, wrapped + .01), trackId, loop);
  const step = Math.min(loop.end, wrapped + .01) - Math.max(loop.start, wrapped - .01);
  const derivative = { x: (after.x - before.x) / step, y: (after.y - before.y) / step, z: (after.z - before.z) / step };
  const tangent = normalize(derivative);
  // Bank the ribbon into the real 3D curve. Projecting a fixed horizontal right
  // vector creates a folded inner edge on a 22–24 metre wide twisted loop.
  const probe = Math.max(loop.start + .02, Math.min(loop.end - .02, wrapped));
  const a = centre(probe - .02, trackId, loop), b = centre(probe, trackId, loop), c = centre(probe + .02, trackId, loop);
  const curvature = { x: c.x - 2 * b.x + a.x, y: c.y - 2 * b.y + a.y, z: c.z - 2 * b.z + a.z };
  const bankedRight = normalize({ x: curvature.y * tangent.z - curvature.z * tangent.y,
    y: curvature.z * tangent.x - curvature.x * tangent.z,
    z: curvature.x * tangent.y - curvature.y * tangent.x });
  const reference = { x: Math.cos(point.angle), y: 0, z: -Math.sin(point.angle) };
  const projection = reference.x * tangent.x + reference.z * tangent.z;
  const flatRight = normalize({ x: reference.x - tangent.x * projection, y: -tangent.y * projection,
    z: reference.z - tangent.z * projection });
  const blend = Math.max(0, Math.min(1, Math.min(fraction, 1 - fraction) / .08));
  const weight = blend * blend * (3 - 2 * blend);
  const right = normalize({ x: flatRight.x * (1 - weight) + bankedRight.x * weight,
    y: flatRight.y * (1 - weight) + bankedRight.y * weight, z: flatRight.z * (1 - weight) + bankedRight.z * weight });
  const up = { x: tangent.y * right.z - tangent.z * right.y,
    y: tangent.z * right.x - tangent.x * right.z, z: tangent.x * right.y - tangent.y * right.x };
  const unsignedPitch = Math.acos(Math.max(-1, Math.min(1, up.y)));
  return { x: position.x + right.x * lateral, y: position.y + right.y * lateral, z: position.z + right.z * lateral,
    angle: point.angle, pitch: fraction <= .5 ? unsignedPitch : 2 * Math.PI - unsignedPitch,
    right, up, tangent, active: true, loopId: loop.id, fraction,
    speedScale: 1 / Math.max(.2, Math.hypot(derivative.x, derivative.y, derivative.z)) };
}

export function kartLoopPose(kart: { x: number; z: number; angle: number; elevation: number; trackId: string; loopId?: string }): TrackLoopPose {
  const near = nearestTrack(kart.x, kart.z, kart.trackId);
  const lateral = (kart.x - near.x) * Math.cos(near.angle) - (kart.z - near.z) * Math.sin(near.angle);
  const pose = trackLoopPose(near.progress, kart.trackId, lateral);
  if (!pose.active || !kart.loopId) return { ...pose, x: kart.x, y: kart.elevation, z: kart.z,
    active: false, loopId: '', fraction: 0, speedScale: 1, angle: kart.angle, pitch: 0,
    tangent: { x: Math.sin(kart.angle), y: 0, z: Math.cos(kart.angle) },
    right: { x: Math.cos(kart.angle), y: 0, z: -Math.sin(kart.angle) }, up: { x: 0, y: 1, z: 0 } };
  const yaw = kart.angle - near.angle, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const tangent = { x: pose.tangent.x * cos + pose.right.x * sin, y: pose.tangent.y * cos + pose.right.y * sin,
    z: pose.tangent.z * cos + pose.right.z * sin };
  const right = { x: pose.right.x * cos - pose.tangent.x * sin, y: pose.right.y * cos - pose.tangent.y * sin,
    z: pose.right.z * cos - pose.tangent.z * sin };
  return { ...pose, tangent, right };
}
