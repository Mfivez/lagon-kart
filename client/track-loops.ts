import * as THREE from 'three';
import { trackPoint, type TrackDefinition, type TrackLoop } from '../shared/track';
import { trackLoopPose, type TrackLoopPose } from '../shared/track-loop';
import { nearestDriveableTrack } from '../shared/track-events';
import { ROAD_RAIL_CENTER_Y, ROAD_RAIL_HEIGHT } from '../shared/obstacle-heights';
import { loopMeshRows } from './track-mesh-sampling';

const basis = new THREE.Matrix4(), right = new THREE.Vector3(), up = new THREE.Vector3(), tangent = new THREE.Vector3();
/** The same orthonormal frame as server motion, including the inverted crest. */
export function applyLoopOrientation(object: THREE.Object3D, pose: TrackLoopPose) {
  right.set(pose.right.x, pose.right.y, pose.right.z);
  up.set(pose.up.x, pose.up.y, pose.up.z);
  tangent.set(pose.tangent.x, pose.tangent.y, pose.tangent.z);
  basis.makeBasis(right, up, tangent); object.quaternion.setFromRotationMatrix(basis);
}
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string, glow = false) {
  const key = `${color}:${glow}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: .7,
    emissive: glow ? color : '#000000', emissiveIntensity: glow ? .28 : 0, side: THREE.DoubleSide }));
  return materials.get(key)!;
}
/** Rectangular extrusion in the actual three-dimensional road frame. */
function beam(track: TrackDefinition, loop: TrackLoop, lateral: number, normal: number, width: number, height: number) {
  const positions: number[] = [], indices: number[] = [], count = loopMeshRows(loop);
  for (let i = 0; i <= count; i++) {
    const progress = loop.start + (loop.end - loop.start) * i / count;
    const pose = trackLoopPose(progress, track.id, lateral);
    for (const [x, y] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
      const across = x * width / 2, above = normal + y * height / 2;
      positions.push(pose.x + pose.right.x * across + pose.up.x * above,
        pose.y + pose.right.y * across + pose.up.y * above,
        pose.z + pose.right.z * across + pose.up.z * above);
    }
    if (i < count) for (let side = 0; side < 4; side++) {
      const a = i * 4 + side, b = i * 4 + (side + 1) % 4;
      indices.push(a, b, b + 4, a, b + 4, a + 4);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** A common longitudinal grid and narrow transverse cells represent the ruled
 * surface. Full-width triangles with different widths intersect on a twisted
 * ribbon even when their surfaces are separated by a few centimetres. */
function surface(track: TrackDefinition, loop: TrackLoop, from: number, to: number, normal: number, transverseStep = 2) {
  const positions: number[] = [], indices: number[] = [];
  const rows = loopMeshRows(loop), columns = Math.ceil((to - from) / transverseStep);
  for (let row = 0; row <= rows; row++) {
    const progress = loop.start + (loop.end - loop.start) * row / rows;
    for (let column = 0; column <= columns; column++) {
      const pose = trackLoopPose(progress, track.id, from + (to - from) * column / columns);
      positions.push(pose.x + pose.up.x * normal, pose.y + pose.up.y * normal, pose.z + pose.up.z * normal);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
let signMaterial: THREE.SpriteMaterial | undefined;
function sign() {
  if (!signMaterial) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#163344'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#a4f7eb'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 504, 120);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 46px system-ui'; ctx.fillText('LOOPING', 256, 58);
    ctx.font = '24px system-ui'; ctx.fillStyle = '#a4f7eb'; ctx.fillText('PISTE MAGNÉTIQUE', 256, 99);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    signMaterial = new THREE.SpriteMaterial({ map });
  }
  const sprite = new THREE.Sprite(signMaterial); sprite.scale.set(12, 3, 1); return sprite;
}
export function buildLoopStructures(track: TrackDefinition): THREE.Group {
  const group = new THREE.Group(); group.name = `loops-${track.id}`;
  for (const loop of track.loops) {
    const halfWidth = track.width / 2;
    const road = new THREE.Mesh(surface(track, loop, -halfWidth, halfWidth, .05, 1), material(track.palette.road));
    road.name = 'loop-road'; road.receiveShadow = true; road.castShadow = true; group.add(road);
    const underside = new THREE.Mesh(surface(track, loop, -halfWidth - 5, halfWidth + 5, -.9), material('#455b68'));
    underside.name = 'loop-deck-underside'; underside.receiveShadow = true; underside.castShadow = true; group.add(underside);
    for (const side of [-1, 1]) {
      const inner = side * halfWidth, outer = side * (halfWidth + 5);
      const shoulder = new THREE.Mesh(surface(track, loop, Math.min(inner, outer), Math.max(inner, outer), .01), material(track.palette.ground));
      shoulder.name = 'loop-shoulder'; shoulder.receiveShadow = true; shoulder.castShadow = true; group.add(shoulder);
      const rim = new THREE.Mesh(beam(track, loop, outer, -.46, .18, .9), material('#455b68'));
      rim.receiveShadow = true; rim.castShadow = true; group.add(rim);
      const rail = new THREE.Mesh(beam(track, loop, side * (track.width / 2 + 5), ROAD_RAIL_CENTER_Y, .4, ROAD_RAIL_HEIGHT), material(track.palette.accent, true));
      rail.castShadow = true; rail.receiveShadow = true; group.add(rail);
      const guide = new THREE.Mesh(beam(track, loop, side * (track.width / 2 - 2), .18, .2, .08), material('#a4f7eb', true)); group.add(guide);
      for (const fraction of [.2, .38, .62, .8]) {
        const pose = trackLoopPose(loop.start + (loop.end - loop.start) * fraction, track.id, side * (track.width / 2 + 7));
        const near = nearestDriveableTrack(pose.x, pose.z, track.id, 2, 3);
        if (pose.y < 3 || near.distance < near.width / 2 + 5) continue;
        const column = new THREE.Mesh(new THREE.CylinderGeometry(.7, 1.2, pose.y, 6), material('#70818b'));
        column.position.set(pose.x, pose.y / 2 - .35, pose.z); column.castShadow = true; group.add(column);
      }
    }
    const start = trackPoint(loop.start - 7, track.id), board = sign();
    board.position.set(start.x + Math.cos(start.angle) * (track.width / 2 + 6), 5, start.z - Math.sin(start.angle) * (track.width / 2 + 6)); group.add(board);
  }
  return group;
}
