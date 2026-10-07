import { ensureCustomTrack } from './custom-track-library';
import { showReplay } from './replay-view';
import type { ReplayData } from '../shared/progression';

export async function openSharedReplay(id: string, timeMs = 0) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Identifiant du replay invalide.');
  const response = await fetch(`/api/replays/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Ce replay n’est plus disponible.');
  const { replay } = await response.json() as { replay: ReplayData };
  await ensureCustomTrack(replay.trackId);
  showReplay(replay, Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0);
}

export async function shareReplay(id: string, timeMs: number): Promise<boolean> {
  const link = new URL('/', location.origin);
  link.searchParams.set('replay', id);
  link.searchParams.set('t', String(Math.max(0, Math.round(Number.isFinite(timeMs) ? timeMs : 0))));
  try { await navigator.clipboard.writeText(link.href); return true; }
  catch {
    const dialog = document.createElement('dialog'); dialog.className = 'garage-dialog replay-share-dialog';
    dialog.innerHTML = '<div class="garage-heading"><h2>Partager ce moment</h2><button type="button" class="secondary">Fermer ✕</button></div><p class="garage-hint">Copiez ce lien pour ouvrir directement le passage.</p><label>Lien du replay<input type="url" readonly aria-label="Lien du replay"></label>';
    const input = dialog.querySelector('input')!; input.value = link.href;
    input.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:8px;font-size:16px';
    dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
    return false;
  }
}
