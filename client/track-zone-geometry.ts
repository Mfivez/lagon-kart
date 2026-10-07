import * as THREE from 'three';
import { getTrack, type TrackZone } from '../shared/track';
import { trackLoopAt, trackLoopPose } from '../shared/track-loop';
import { loopMeshRows, roadMeshRows } from './track-mesh-sampling';

/** Permanent and lap-triggered zones follow the same road, including inverted loops. */
export function trackZoneGeometry(trackId: string, zone: Pick<TrackZone, 'start' | 'end' | 'width' | 'offset'>, lift = .085) {
  const track = getTrack(trackId), vertices: number[] = [], indices: number[] = [];
  const folded = track.loops.some(loop => zone.start < loop.end && zone.end > loop.start);
  const pieces = roadMeshRows(zone.end - zone.start, folded ? .5 : 2);
  const samples = Array.from({ length: pieces + 1 }, (_, i) => zone.start + (zone.end - zone.start) * i / pieces);
  const progressSamples = folded ? [...new Set([zone.start, zone.end,
    ...samples.filter(progress => !trackLoopAt(progress, trackId)),
    ...track.loops.flatMap(loop => {
      const rows = loopMeshRows(loop);
      return Array.from({ length: rows + 1 }, (_, row) => loop.start + (loop.end - loop.start) * row / rows)
        .filter(progress => progress > zone.start && progress < zone.end);
    }),
  ])].sort((a, b) => a - b) : samples;
  const columns = folded ? Math.ceil(zone.width) : 1;
  for (let i = 0; i < progressSamples.length; i++) {
    const progress = progressSamples[i]!;
    for (let column = 0; column <= columns; column++) {
      const offset = zone.offset - zone.width / 2 + zone.width * column / columns;
      const pose = trackLoopPose(progress, trackId, offset), loop = trackLoopAt(progress, trackId);
      if (loop) {
        // Match the road's triangles even when a patch starts between two rows.
        const rows = loopMeshRows(loop), row = (progress - loop.start) / (loop.end - loop.start) * rows;
        const low = Math.max(0, Math.min(rows, Math.floor(row))), high = Math.min(rows, low + 1), t = row - low;
        const a = trackLoopPose(loop.start + (loop.end - loop.start) * low / rows, trackId, offset);
        const b = trackLoopPose(loop.start + (loop.end - loop.start) * high / rows, trackId, offset);
        const height = lift + .01;
        vertices.push(a.x + (b.x - a.x) * t + (a.up.x + (b.up.x - a.up.x) * t) * height,
          a.y + (b.y - a.y) * t + (a.up.y + (b.up.y - a.up.y) * t) * height,
          a.z + (b.z - a.z) * t + (a.up.z + (b.up.z - a.up.z) * t) * height);
      } else vertices.push(pose.x + pose.up.x * lift, pose.y + pose.up.y * lift, pose.z + pose.up.z * lift);
      if (i + 1 < progressSamples.length && column < columns) {
        const a = i * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
