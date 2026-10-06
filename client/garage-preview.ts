import * as THREE from 'three';
import { createKartModel, createKartContactShadow, type KartModelInstance } from './kart-model';
import type { GarageChoice } from './garage-ui';

/** Renders only when the selection changes; the garage adds no race-time render loop. */
export class GaragePreview {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 2.8, .1, 40);
  private instance?: KartModelInstance;
  private generation = 0;
  private key = '';
  constructor() {
    this.canvas.className = 'garage-preview'; this.canvas.setAttribute('aria-label', 'Aperçu de votre personnage et de votre kart');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(560, 200, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.scene.add(new THREE.HemisphereLight('#fffbec', '#537678', 3));
    const light = new THREE.DirectionalLight('#fff2d6', 3); light.position.set(5, 8, 4); this.scene.add(light);
    this.scene.add(createKartContactShadow()); this.camera.position.set(5.6, 3.5, 6.8); this.camera.lookAt(0, 1.2, 0);
  }
  async show(parent: HTMLElement, choice: GarageChoice, color: string) {
    parent.append(this.canvas);
    const key = choice.modelId + ':' + choice.characterId;
    if (key !== this.key || !this.instance) {
      const generation = ++this.generation;
      const next = await createKartModel(color, choice.modelId, choice.characterId);
      if (generation !== this.generation) { next.dispose(); return; }
      this.instance?.dispose(); this.instance = next; this.key = key; this.scene.add(next.group);
    }
    this.instance.setColor(color); this.renderer.render(this.scene, this.camera);
  }
}
