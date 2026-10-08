import { getAvailableTracks, isTrackId, retireCustomTrackDefinition } from '../shared/track';
import { customTrackRuntimeId, registerCustomTrack, type CustomTrackDraft, type StoredCustomTrack } from '../shared/custom-tracks';
export {registerCustomTrackPreview,releaseCustomTrackPreview,type CustomTrackPreview} from '../shared/custom-tracks';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error ?? 'Impossible de charger les circuits. Réessayez.'), { status: response.status });
  return result as T;
}

let catalog = new Map<string, StoredCustomTrack>();
let catalogLoaded = false;
let catalogGeneration = 0;
let listSequence = 0;
let acceptedSequence = 0;
const retiredIds = new Set<string>();

export async function listCustomTracks(): Promise<StoredCustomTrack[]> {
  const sequence = ++listSequence, generation = catalogGeneration;
  const { tracks } = await request<{ tracks: StoredCustomTrack[] }>('/api/tracks');
  // A save/delete completed while the GET was in flight: read a fresh snapshot.
  if (generation !== catalogGeneration) return listCustomTracks();
  if (sequence < acceptedSequence) return [...catalog.values()];
  acceptedSequence = sequence;
  const current = tracks.filter(record => !retiredIds.has(record.id));
  const visibleIds = new Set(current.map(record => record.id));
  for (const track of getAvailableTracks()) {
    if (!track.id.startsWith('custom-')) continue;
    const id = track.id.replace(/-v[1-9][0-9]*$/, '');
    if (!visibleIds.has(id)) { retiredIds.add(id); retireCustomTrackDefinition(id); }
  }
  catalog = new Map(current.map(record => [record.id, record])); catalogLoaded = true;
  for (const record of current) registerCustomTrack(record);
  return current;
}

export async function saveCustomTrack(draft: CustomTrackDraft, token: string,
  previous?: { id: string; revision: number }): Promise<StoredCustomTrack> {
  const { track } = await request<{ track: StoredCustomTrack }>(previous ? `/api/tracks/${encodeURIComponent(previous.id)}` : '/api/tracks', {
    method: previous ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ draft, ...(previous ? { revision: previous.revision } : {}) }),
  });
  ++catalogGeneration;
  catalog.set(track.id, track);
  registerCustomTrack(track);
  return track;
}

export async function deleteCustomTrack(id: string, revision: number, token: string): Promise<void> {
  await request<{ deletedId: string }>(`/api/tracks/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ revision }),
  });
  ++catalogGeneration; catalog.delete(id); retiredIds.add(id); retireCustomTrackDefinition(id);
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
      // Loading a replay's historical version must not advertise a removed track.
      if (retiredIds.has(track.id) || catalogLoaded && !catalog.has(track.id)) retireCustomTrackDefinition(track.id);
    })();
    pending.set(id, promise);
  }
  try { await promise; } finally { pending.delete(id); }
}
