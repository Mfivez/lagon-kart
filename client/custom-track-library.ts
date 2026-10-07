import { isTrackId } from '../shared/track';
import { customTrackRuntimeId, registerCustomTrack, type CustomTrackDraft, type StoredCustomTrack } from '../shared/custom-tracks';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Impossible de charger les circuits. Réessayez.');
  return result as T;
}

export async function listCustomTracks(): Promise<StoredCustomTrack[]> {
  const { tracks } = await request<{ tracks: StoredCustomTrack[] }>('/api/tracks');
  for (const record of tracks) registerCustomTrack(record);
  return tracks;
}

export async function saveCustomTrack(draft: CustomTrackDraft, token: string,
  previous?: { id: string; revision: number }): Promise<StoredCustomTrack> {
  const { track } = await request<{ track: StoredCustomTrack }>(previous ? `/api/tracks/${encodeURIComponent(previous.id)}` : '/api/tracks', {
    method: previous ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ draft, ...(previous ? { revision: previous.revision } : {}) }),
  });
  registerCustomTrack(track);
  return track;
}

const pending = new Map<string, Promise<void>>();
/** Old revisions remain loadable for saved replays and invitations. */
export async function ensureCustomTrack(id: string): Promise<void> {
  if (isTrackId(id)) return;
  let promise = pending.get(id);
  if (!promise) {
    promise = (async () => {
      const { track } = await request<{ track: StoredCustomTrack }>(`/api/tracks/${encodeURIComponent(id)}`);
      if (customTrackRuntimeId(track) !== id) throw new Error('Cette version du circuit est indisponible.');
      registerCustomTrack(track);
    })();
    pending.set(id, promise);
  }
  try { await promise; } finally { pending.delete(id); }
}
