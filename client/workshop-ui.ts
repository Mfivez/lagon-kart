import type { World } from '../shared/game';
import './workshop-ui.css';

export const workshopMarkup = '<aside id="workshop-controls" class="workshop-controls hidden" aria-label="Essai du passage"><div><strong id="workshop-title"></strong><small>Essai libre · aucun XP ni record</small></div><button id="workshop-restart" class="secondary" type="button">↺ Recommencer</button></aside>';

export function updateWorkshop(world: World | null, connected: boolean) {
  const panel = document.getElementById('workshop-controls')!;
  panel.classList.toggle('hidden', !world?.workshop || world.phase !== 'racing');
  if (!world?.workshop) return;
  document.getElementById('workshop-title')!.textContent = world.workshop.label;
  (document.getElementById('workshop-restart') as HTMLButtonElement).disabled = !connected;
}
