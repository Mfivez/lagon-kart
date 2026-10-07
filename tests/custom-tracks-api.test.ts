import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlayerProfile } from '../shared/progression.js';
import type { CustomTrackDraft, StoredCustomTrack } from '../shared/custom-tracks.js';

const draft: CustomTrackDraft = { name: 'Circuit HTTP de classe', theme: 'forest', width: 18,
  anchors: Array.from({ length: 8 }, (_, index) => ({ x: Math.sin(index * Math.PI / 4) * 120,
    z: -Math.cos(index * Math.PI / 4) * 100 })), zones: [] };

test('same-origin custom track API publishes usable revisions and preserves player data', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tracks-api-'));
  const oldPlayers = process.env.PLAYER_DATA_DIR, oldTracks = process.env.CUSTOM_TRACK_DATA_DIR;
  process.env.PLAYER_DATA_DIR = join(directory, 'players');
  delete process.env.CUSTOM_TRACK_DATA_DIR;
  const { createGameServer } = await import('../server/app.js');
  const { gameServer, httpServer, ready } = createGameServer(directory);
  t.after(async () => {
    await gameServer.gracefullyShutdown(false);
    if (oldPlayers === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = oldPlayers;
    if (oldTracks === undefined) delete process.env.CUSTOM_TRACK_DATA_DIR; else process.env.CUSTOM_TRACK_DATA_DIR = oldTracks;
    await rm(directory, { recursive: true, force: true });
  });
  await ready; await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  async function request(path: string, method = 'GET', body?: unknown, token?: string, headers: Record<string, string> = {}) {
    const response = await fetch(origin + path, { method, headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, data: await response.json() as any };
  }
  const owner = (await request('/api/profile', 'POST', { name: 'Architecte' })).data as { token: string; profile: PlayerProfile };
  const other = (await request('/api/profile', 'POST', { name: 'Invité' })).data as typeof owner;
  const playerData = await readFile(join(directory, 'players', 'players.json'), 'utf8');
  let first: StoredCustomTrack & { runtimeId: string }, second: typeof first;

  await t.test('guests publish and any player reads the latest catalogue and exact historical version', async () => {
    assert.deepEqual((await request('/api/tracks')).data, { tracks: [] });
    const response = await request('/api/tracks', 'POST', { draft, authorId: other.profile.id,
      authorName: 'Forged author', id: 'custom-forged', revision: 800 }, owner.token, { origin });
    assert.equal(response.status, 201); first = response.data.track;
    assert.match(first.id, /^custom-[a-f0-9-]+$/); assert.notEqual(first.id, 'custom-forged');
    assert.equal(first.authorId, owner.profile.id); assert.equal(first.authorName, owner.profile.name);
    assert.equal(first.revision, 1); assert.equal(first.runtimeId, `${first.id}-v1`);
    assert.deepEqual((await request('/api/tracks')).data.tracks, [first]);
    assert.deepEqual((await request('/api/tracks/' + first.runtimeId)).data.track, first);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    const encoded = JSON.stringify(first);
    for (const secret of [owner.token, other.token, 'tokenHash', 'passwordHash']) assert.ok(!encoded.includes(secret));
  });

  await t.test('owner updates are versioned; duplicate and concurrent tabs cannot overwrite another revision', async () => {
    const edited = { ...draft, name: 'Circuit modifié', theme: 'neon' };
    assert.equal((await request('/api/tracks/' + first.id, 'PUT', { draft: edited, revision: 1 }, other.token)).status, 403);
    const updated = await request('/api/tracks/' + first.id, 'PUT', { draft: edited, revision: 1 }, owner.token);
    assert.equal(updated.status, 200); second = updated.data.track;
    assert.equal(second.revision, 2); assert.notEqual(second.runtimeId, first.runtimeId);
    assert.equal((await request('/api/tracks/' + first.id, 'PUT', { draft, revision: 1 }, owner.token)).status, 409);
    assert.deepEqual((await request('/api/tracks')).data.tracks, [second]);
    assert.deepEqual((await request('/api/tracks/' + first.runtimeId)).data.track, first);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'tracks', first.runtimeId + '.json'), 'utf8')), first);
    const duplicated = await request('/api/tracks', 'POST', { draft: second.draft }, other.token);
    assert.equal(duplicated.status, 201); assert.notEqual(duplicated.data.track.id, first.id);
    assert.equal(duplicated.data.track.authorId, other.profile.id);
  });

  await t.test('invalid auth, origins, methods, names, routes and oversized bodies are rejected without changing data', async () => {
    assert.equal((await request('/api/tracks', 'POST', { draft })).status, 401);
    assert.equal((await request('/api/tracks', 'POST', { draft }, 'lk_' + 'x'.repeat(43))).status, 401);
    assert.equal((await request('/api/tracks', 'POST', { draft }, owner.token, { origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await request('/api/tracks', 'POST', { draft }, owner.token, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await request('/api/tracks', 'DELETE', undefined, owner.token)).status, 405);
    assert.equal((await request('/api/tracks/nope')).status, 404);
    assert.equal((await request('/api/tracks/custom-absent-v1')).status, 404);
    assert.equal((await request('/api/tracks/custom-absent', 'PUT', { draft, revision: 1 }, owner.token)).status, 404);
    assert.equal((await request('/api/tracks', 'POST', { draft: { ...draft, anchors: [] } }, owner.token)).status, 400);
    assert.equal((await request('/api/tracks', 'POST', { draft: { ...draft, name: '\u0000bad' } }, owner.token)).status, 400);
    assert.equal((await request('/api/tracks', 'POST', { draft, padding: 'x'.repeat(33_000) }, owner.token)).status, 413);
    for (const body of ['null', '[]', '{broken']) {
      const response = await fetch(origin + '/api/tracks', { method: 'POST', headers: {
        authorization: 'Bearer ' + owner.token, 'content-type': 'application/json',
      }, body });
      assert.equal(response.status, 400); await response.arrayBuffer();
    }
    assert.equal((await request('/api/tracks')).data.tracks.length, 2);
    assert.equal((await readdir(join(directory, 'tracks'))).length, 3);
    assert.equal(await readFile(join(directory, 'players', 'players.json'), 'utf8'), playerData);
    assert.equal((await request('/healthz')).status, 200);
  });

  await t.test('linking a guest to an account retains ownership for later sign-in sessions', async () => {
    const account = await request('/api/account/register', 'POST', { username: 'CircuitOwner', password: 'classroom circuit 2026' }, owner.token);
    assert.equal(account.status, 201); assert.equal(account.data.profile.id, first.authorId);
    const login = await request('/api/account/login', 'POST', { username: 'CircuitOwner', password: 'classroom circuit 2026' });
    assert.equal(login.status, 200);
    const updated = await request('/api/tracks/' + first.id, 'PUT', { draft, revision: 2 }, login.data.token);
    assert.equal(updated.status, 200); assert.equal(updated.data.track.revision, 3);
    assert.equal(updated.data.track.authorId, first.authorId);
  });
  await t.test('tight and coincident points can be saved and reloaded without changing their authored shape', async () => {
    const creative = structuredClone(draft); creative.name = 'Épingles et points collés';
    creative.anchors[1] = {...creative.anchors[0]!};
    creative.anchors[4]!.z *= .05;
    creative.zones = [{kind:'boost',start:0,end:1,width:8,offset:0},{kind:'ice',start:0,end:1,width:8,offset:0}];
    const response = await request('/api/tracks','POST',{draft:creative},owner.token);
    assert.equal(response.status,201);
    const saved = response.data.track as StoredCustomTrack & {runtimeId:string};
    assert.deepEqual(saved.draft,creative);
    assert.deepEqual((await request('/api/tracks/'+saved.runtimeId)).data.track,saved);
    const {CustomTrackStore} = await import('../server/custom-track-store.js');
    const reopened = await CustomTrackStore.open(join(directory,'tracks'));
    assert.deepEqual(reopened.get(saved.runtimeId)!.draft,creative);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'tracks',saved.runtimeId+'.json'),'utf8')).draft,creative);
  });

});
