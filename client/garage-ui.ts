import { CHARACTERS, normalizeCharacterId, type CharacterId } from '../shared/characters';
import { KART_MODELS, normalizeKartModelId, type KartModelId } from '../shared/kart-catalog';
import { DEFAULT_BUILD, GARAGE_PARTS, GARAGE_SLOTS, SLOT_NAMES, getKartStats, normalizeBuild, type KartBuild } from '../shared/garage';
import { GaragePreview } from './garage-preview';

export type GarageChoice = { modelId: KartModelId; characterId: CharacterId; build: KartBuild };
export class GarageUI {
  private readonly dialog = document.createElement('dialog');
  private level = 0;
  private choice: GarageChoice;
  private preview?: GaragePreview;
  constructor(private readonly changed: (choice: GarageChoice) => void) {
    let saved: unknown;
    try { saved = JSON.parse(localStorage.getItem('lagon-build') ?? 'null'); } catch { /* Previous malformed preferences use the base build. */ }
    this.choice = { characterId: normalizeCharacterId(localStorage.getItem('lagon-character')), modelId: normalizeKartModelId(localStorage.getItem('lagon-model')), build: normalizeBuild(saved, 3) };
    this.dialog.id = 'garage-dialog'; this.dialog.className = 'garage-dialog';
    document.body.append(this.dialog);
    this.dialog.addEventListener('change', event => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      if (target.id === 'kart-model-select') this.choice.modelId = normalizeKartModelId(target.value);
      else if (target.id === 'character-select') this.choice.characterId = normalizeCharacterId(target.value);
      else if (GARAGE_SLOTS.includes(target.dataset.slot as typeof GARAGE_SLOTS[number])) {
        this.choice.build = normalizeBuild({ ...this.choice.build, [target.dataset.slot!]: target.value }, this.level);
      } else return;
      this.save(); this.render(); this.changed(this.value);
    });
    this.dialog.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (button?.id === 'garage-close') this.dialog.close();
      if (button?.id === 'garage-reset') { this.choice.build = { ...DEFAULT_BUILD }; this.save(); this.render(); this.changed(this.value); }
    });
  }
  get value(): GarageChoice { return { modelId: this.choice.modelId, characterId: this.choice.characterId, build: { ...this.choice.build } }; }
  setLevel(level: number) {
    this.level = Math.max(0, Math.min(3, level));
    this.choice.build = normalizeBuild(this.choice.build, this.level);
    this.save(); if (this.dialog.open) this.render();
  }
  open() { this.render(); this.dialog.showModal(); }
  private save() { localStorage.setItem('lagon-character', this.choice.characterId); localStorage.setItem('lagon-model', this.choice.modelId); localStorage.setItem('lagon-build', JSON.stringify(this.choice.build)); }
  private render() {
    const stats = getKartStats(this.choice.build);
    this.dialog.innerHTML = `<div class="garage-heading"><div><small>VOTRE GARAGE · NIVEAU ${this.level}</small><h2>Un kart à votre goût</h2></div><button id="garage-close" class="secondary" aria-label="Fermer le garage">Fermer ✕</button></div><div id="garage-preview-slot"></div>
      <label class="config-field"><span>Personnage · ${CHARACTERS.length} pilotes</span><select id="character-select" aria-describedby="character-description">${CHARACTERS.map(character => `<option value="${character.id}" ${this.choice.characterId === character.id ? 'selected' : ''}>${character.name}</option>`).join('')}</select><small id="character-description">${CHARACTERS.find(character => character.id === this.choice.characterId)!.description}</small></label>
      <label class="config-field"><span>Modèle de carrosserie</span><select id="kart-model-select">${KART_MODELS.map(model => `<option value="${model.id}" ${this.choice.modelId === model.id ? 'selected' : ''}>${model.name}</option>`).join('')}</select></label>
      <p class="garage-hint">Le modèle change le look. Les pièces ci-dessous déterminent la conduite. La couleur choisie reste disponible sur chaque modèle.</p>
      <div class="garage-parts">${GARAGE_SLOTS.map(slot => {
        const parts = GARAGE_PARTS.filter(part => part.slot === slot);
        const current = parts.find(part => part.id === this.choice.build[slot])!;
        return `<label class="config-field"><span>${SLOT_NAMES[slot]}</span><select data-slot="${slot}" aria-label="${SLOT_NAMES[slot]}">${parts.map(part => `<option value="${part.id}" ${part.id === current.id ? 'selected' : ''} ${part.unlockLevel > this.level ? 'disabled' : ''}>${part.name}${part.unlockLevel > this.level ? ` · niveau ${part.unlockLevel} 🔒` : ''}</option>`).join('')}</select><small>${current.description}</small></label>`;
      }).join('')}</div>
      <div class="garage-stats" aria-label="Caractéristiques du kart"><span>Vitesse <b>${Math.round(stats.speed * 3.6)} km/h</b></span><span>Accélération <b>${stats.acceleration.toFixed(0)}</b></span><span>Direction <b>${Math.round(stats.handling / 1.32 * 100)} %</b></span><span>Adhérence <b>${Math.round(stats.grip * 100)} %</b></span><span>Stabilité <b>${Math.round(stats.stability * 100)} %</b></span><span>Boue <b>${Math.round(stats.mud * 3.6)} km/h</b></span></div>
      <p class="garage-hint">Terminez les championnats pour débloquer des pièces. Chaque avantage a une contrepartie : essayez les pneus tout-terrain dans la boue ou une configuration vive dans les virages.</p><button id="garage-reset" class="secondary">Configuration équilibrée</button>`;
    try {
      this.preview ??= new GaragePreview();
      void this.preview.show(this.dialog.querySelector<HTMLElement>('#garage-preview-slot')!, this.value, localStorage.getItem('lagon-color') ?? '#fc735d').catch(() => { /* The selectors work even if the preview cannot render. */ });
    } catch { /* Selection remains available when a second WebGL context is unavailable. */ }
  }
}
