import * as THREE from 'three';
import type { GhostData } from '../shared/progression';
import type { World } from '../shared/game';
import { trackElevation } from '../shared/track';
import { nearestDriveableTrack } from '../shared/track-events';
import { replayPosition } from './replay-view';

/** A translucent marker follows recorded server positions; it never enters the simulation. */
export class GhostView {
  private ghost: GhostData | null = null;
  private readonly group = new THREE.Group();
  constructor(parent: THREE.Object3D) {
    const material = new THREE.MeshBasicMaterial({ color: '#e8fdff', transparent: true, opacity: .35, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, .7, 3.2), material); body.position.y = .7;
    const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(.52, 1), material); helmet.position.set(0, 1.45, -.2);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.38, .9, 4), material); arrow.position.set(0, 2.9, 0); arrow.rotation.z = Math.PI;
    this.group.add(body, helmet, arrow); this.group.name = 'best-time-ghost'; this.group.visible = false; parent.add(this.group);
  }
  set(ghost: GhostData | null) { this.ghost = ghost; this.group.visible = false; }
  update(world: World | null) {
    const ghost = this.ghost;
    this.group.visible = !!ghost && !!world?.practice && world.phase === 'racing' && world.trackId === ghost.trackId && world.eventLevel === (ghost.eventLevel ?? 0) && world.raceTime <= ghost.finishTime;
    if (!this.group.visible || !ghost || !world) return;
    const point = replayPosition(ghost.frames, world.raceTime * 1000);
    if (point) { this.group.position.set(point.x, .12 + trackElevation(nearestDriveableTrack(point.x, point.z, world.trackId, world.eventStage, world.eventLevel).progress, world.trackId), point.z); this.group.rotation.y = point.angle; }
  }
}
