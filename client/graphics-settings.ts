import { GRAPHICS_STORAGE_KEY, graphicsMode, type GraphicsMode } from './graphics-policy';

export const graphicsSettingsMarkup = `<label class="graphics-setting" for="graphics-quality"><span>Graphismes</span><select id="graphics-quality" aria-label="Qualité graphique" aria-describedby="graphics-quality-help"><option value="auto">Auto</option><option value="smooth">Fluide</option><option value="detailed">Détaillé</option></select><span id="graphics-quality-help" class="graphics-help">Auto adapte le rendu en course. Fluide réduit les détails et les ombres. Détaillé privilégie l’image.</span></label>`;

export class GraphicsSettings {
  private readonly select = document.getElementById('graphics-quality') as HTMLSelectElement;
  constructor(private readonly change: (mode: GraphicsMode) => void) {
    let mode: GraphicsMode = 'auto';
    try { mode = graphicsMode(localStorage.getItem(GRAPHICS_STORAGE_KEY)); } catch { /* Optional preference, including private tabs. */ }
    this.select.value = mode; this.change(mode);
    this.select.addEventListener('change', () => {
      const next = graphicsMode(this.select.value); this.select.value = next;
      try { localStorage.setItem(GRAPHICS_STORAGE_KEY, next); } catch { /* Rendering still changes without persistence. */ }
      this.change(next);
    });
  }
}
