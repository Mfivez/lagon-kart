import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CustomTrackError, CustomTrackStore } from '../server/custom-track-store.js';
import { getTrack } from '../shared/track.js';
import type { CustomTrackDraft } from '../shared/custom-tracks.js';

const author = { id: 'class-pilot-1', name: 'Architecte' };
const other = { id: 'class-pilot-2', name: 'Copilote' };
function draft(name = 'Circuit de la classe'): CustomTrackDraft {
  return { name, theme: 'tropical', width: 18, anchors: Array.from({ length: 8 }, (_, index) => ({
    x: Math.round(Math.sin(index * Math.PI / 4) * 120), z: Math.round(-Math.cos(index * Math.PI / 4) * 100),
  })), zones: [{ kind: 'boost', start: .16, end: .19, offset: 0, width: 8 }] };
}
function status(expected: number) { return (error: unknown) => error instanceof CustomTrackError && error.status === expected; }

test('custom circuits survive reopening with all immutable revisions and isolated public values', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tracks-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await CustomTrackStore.open(directory, { now: () => 1000 });
  const first = await store.save(author, draft());
  const original = await readFile(join(directory, first.runtimeId + '.json'), 'utf8');
  const second = await store.save(author, draft('Deuxième version'), first.id, first.revision);
  assert.equal(second.id, first.id); assert.equal(second.revision, 2);
  assert.notEqual(second.runtimeId, first.runtimeId);
  assert.equal(await readFile(join(directory, first.runtimeId + '.json'), 'utf8'), original);
  assert.equal(getTrack(first.runtimeId).name, 'Circuit de la classe');
  assert.equal(getTrack(second.runtimeId).name, 'Deuxième version');
  first.draft.anchors[0]!.x = 99_999;
  store.list()[0]!.draft.name = 'Mutation non autorisée';
  assert.equal(store.get(second.runtimeId)!.draft.name, 'Deuxième version');
  const reopened = await CustomTrackStore.open(directory);
  assert.equal(reopened.list().length, 1);
  assert.deepEqual(reopened.get(second.runtimeId), second);
  assert.equal(reopened.get(first.runtimeId)!.draft.anchors[0]!.x, 0);
  assert.deepEqual((await readdir(directory)).sort(), [first.runtimeId + '.json', second.runtimeId + '.json'].sort());
});

test('only owners edit; optimistic revisions serialize simultaneous saves without lost updates', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tracks-owners-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await CustomTrackStore.open(directory);
  const first = await store.save(author, draft());
  await assert.rejects(store.save(other, draft(), first.id, 1), status(403));
  await assert.rejects(store.save(author, draft(), '../outside', 1), status(400));
  await assert.rejects(store.save(author, draft(), 'custom-absent', 1), status(404));
  await assert.rejects(store.save(author, draft(), first.id, '1'), status(400));
  const results = await Promise.allSettled([
    store.save(author, draft('Premier onglet'), first.id, 1),
    store.save(author, draft('Deuxième onglet'), first.id, 1),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.status, 409);
  assert.equal(store.list()[0]!.draft.name, 'Premier onglet');
  const duplicate = await store.save(other, store.list()[0]!.draft);
  assert.notEqual(duplicate.id, first.id); assert.equal(duplicate.authorId, other.id);
});

test('invalid geometry never creates files and failed persistence never publishes a circuit', async t => {
  const root = await mkdtemp(join(tmpdir(), 'lagon-tracks-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'tracks');
  const store = await CustomTrackStore.open(directory);
  for (const invalid of [null, [], {}, { ...draft(), width: -1 }, { ...draft(), anchors: [] },
    { ...draft(), anchors: [{ x: Infinity, z: 0 }] }, { ...draft(), zones: [{ kind: 'jump', start: 0, end: 1 }] }]) {
    await assert.rejects(store.save(author, invalid), status(400));
  }
  assert.deepEqual(await readdir(directory), []);
  await rm(directory, { recursive: true }); await writeFile(directory, 'Not a directory');
  await assert.rejects(store.save(author, draft()), status(503));
  assert.equal(store.list().length, 0);
});

test('a corrupt revision preserves bytes and does not prevent other circuits from loading', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tracks-corrupt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await CustomTrackStore.open(directory);
  const first = await store.save(author, draft('Sauvegarde saine'));
  const second = await store.save(other, draft('Autre circuit'));
  const brokenFile = join(directory, `${first.id}-v2.json`);
  await writeFile(brokenFile, '{broken and retained');
  await writeFile(join(directory, '.partial.tmp'), '{interrupted write');
  const reopened = await CustomTrackStore.open(directory);
  assert.equal(reopened.list().length, 2);
  assert.equal(reopened.get(second.runtimeId)!.draft.name, 'Autre circuit');
  assert.equal(reopened.get(first.runtimeId)!.draft.name, 'Sauvegarde saine');
  await assert.rejects(reopened.save(author, draft(), first.id, 1), status(503));
  assert.equal(await readFile(brokenFile, 'utf8'), '{broken and retained');
  assert.equal((await reopened.save(other, draft('Autre circuit modifié'), second.id, 1)).revision, 2);
});

test('existing files cannot be replaced by a competing store and capacity limits retain old versions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-tracks-limits-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await CustomTrackStore.open(directory, { maxTracks: 2, maxTracksPerAuthor: 1, maxRevisions: 2 });
  const first = await store.save(author, draft());
  const stale = await CustomTrackStore.open(directory);
  const second = await store.save(author, draft('Version gagnante'), first.id, 1);
  await assert.rejects(stale.save(author, draft('Tentative écrasement'), first.id, 1), status(409));
  assert.equal(JSON.parse(await readFile(join(directory, second.runtimeId + '.json'), 'utf8')).draft.name, 'Version gagnante');
  await assert.rejects(store.save(author, draft(), first.id, 2), status(409));
  await assert.rejects(store.save(author, draft('Trop de circuits')), status(409));
  await store.save(other, draft('Deuxième pilote'));
  await assert.rejects(store.save({ id: 'third', name: 'Troisième' }, draft()), status(409));
  assert.equal(store.list().length, 2); assert.ok(store.get(first.runtimeId));
});
