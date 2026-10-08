import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_TRACK_TEMPLATES, customTrackRuntimeId, type StoredCustomTrack } from '../shared/custom-tracks.js';
import { getAvailableTracks, getTrack } from '../shared/track.js';

const record = (name: string): StoredCustomTrack => ({
  id: `custom-library-${name}`, revision: 1,
  draft: structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft), authorId: 'owner', authorName: 'Créateur',
  createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z',
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
let moduleIndex = 0;
const freshLibrary = () => import(`../client/custom-track-library.ts?test=${++moduleIndex}`) as Promise<typeof import('../client/custom-track-library.js')>;
const listed = (item: StoredCustomTrack) => getAvailableTracks().some(track => track.id === customTrackRuntimeId(item));

test('deleting a custom circuit removes the catalogue entry while preserving its loaded historical geometry', async t => {
  const library = await freshLibrary(), circuit = record('delete'), requests: Array<{ path: string; method: string; body?: unknown; authorization: string | null }> = [];
  t.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    requests.push({ path, method: options?.method ?? 'GET', body: options?.body ? JSON.parse(String(options.body)) : undefined,
      authorization: new Headers(options?.headers).get('authorization') });
    return options?.method === 'DELETE' ? json({ deletedId: circuit.id }) : json({ tracks: [circuit] });
  });
  await library.listCustomTracks(); const original = getTrack(customTrackRuntimeId(circuit));
  assert.ok(listed(circuit));
  await library.deleteCustomTrack(circuit.id, 1, 'fixture-token');
  assert.equal(listed(circuit), false);
  assert.strictEqual(getTrack(customTrackRuntimeId(circuit)), original);
  assert.deepEqual(requests[1], { path: `/api/tracks/${circuit.id}`, method: 'DELETE', body: { revision: 1 }, authorization: 'Bearer fixture-token' });
  assert.deepEqual(await library.listCustomTracks(), [], 'even a stale intermediary response cannot resurrect a deleted circuit');
});

test('an old GET response arriving after DELETE is refreshed instead of resurrecting the circuit', async t => {
  const library = await freshLibrary(), circuit = record('race-delete'), oldResponse = deferred<Response>();
  let gets = 0;
  t.mock.method(globalThis, 'fetch', async (_path: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') return json({ deletedId: circuit.id });
    ++gets;
    return gets === 1 ? json({ tracks: [circuit] }) : gets === 2 ? oldResponse.promise : json({ tracks: [] });
  });
  await library.listCustomTracks();
  const oldList = library.listCustomTracks();
  await library.deleteCustomTrack(circuit.id, 1, 'fixture-token');
  oldResponse.resolve(json({ tracks: [circuit] }));
  assert.deepEqual(await oldList, []);
  assert.equal(gets, 3, 'a mutation invalidates the previous catalogue request');
  assert.equal(listed(circuit), false);
});

test('an old empty catalogue response arriving after publication cannot remove the new circuit', async t => {
  const library = await freshLibrary(), circuit = record('race-save'), oldResponse = deferred<Response>();
  let gets = 0;
  t.mock.method(globalThis, 'fetch', async (_path: string, options?: RequestInit) => {
    if (options?.method === 'POST') return json({ track: circuit });
    return ++gets === 1 ? oldResponse.promise : json({ tracks: [circuit] });
  });
  const oldList = library.listCustomTracks();
  await library.saveCustomTrack(circuit.draft, 'fixture-token');
  oldResponse.resolve(json({ tracks: [] }));
  assert.deepEqual((await oldList).map(item => item.id), [circuit.id]);
  assert.ok(listed(circuit));
});

test('a newer catalogue response wins, and replay loading keeps an absent circuit out of future choices', async t => {
  const library = await freshLibrary(), oldCircuit = record('old-snapshot'), replayCircuit = record('replay'), oldResponse = deferred<Response>();
  let gets = 0;
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path.endsWith(customTrackRuntimeId(replayCircuit))) return json({ track: replayCircuit });
    return ++gets === 1 ? oldResponse.promise : json({ tracks: [] });
  });
  const oldList = library.listCustomTracks();
  await library.listCustomTracks();
  oldResponse.resolve(json({ tracks: [oldCircuit] }));
  assert.deepEqual(await oldList, []);
  assert.equal(listed(oldCircuit), false);
  await library.ensureCustomTrack(customTrackRuntimeId(replayCircuit));
  assert.equal(getTrack(customTrackRuntimeId(replayCircuit)).id, customTrackRuntimeId(replayCircuit));
  assert.equal(listed(replayCircuit), false);
});

test('a rejected deletion keeps the circuit available and exposes the status for recovery', async t => {
  const library = await freshLibrary(), circuit = record('denied');
  let failureStatus = 409;
  t.mock.method(globalThis, 'fetch', async (_path: string, options?: RequestInit) => options?.method === 'DELETE'
    ? json({ error: 'Suppression refusée.' }, failureStatus) : json({ tracks: [circuit] }));
  await library.listCustomTracks();
  for (const status of [401, 403, 409, 503]) {
    failureStatus = status;
    await assert.rejects(library.deleteCustomTrack(circuit.id, 1, 'fixture-token'), { message: 'Suppression refusée.', status });
    assert.ok(listed(circuit));
  }
});
