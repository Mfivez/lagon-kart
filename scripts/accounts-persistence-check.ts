import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerProfile, ReplayData } from '../shared/progression.js';

const exec = promisify(execFile), image = process.env.PERSISTENCE_IMAGE ?? 'lagon-kart-app:latest';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'lagon-accounts-'));
const directory = join(temp, 'data'), file = join(temp, 'compose.json');
const suffix = randomUUID().slice(0, 8), projects = [`lagon-account-a-${suffix}`, `lagon-account-b-${suffix}`];
const origin = 'http://127.0.0.1:3105', checks: string[] = [], started = Date.now();
const username = `classe_${suffix}`, password = `test-${randomUUID()}`;
// Keep the runner alive while Node's HTTP pool has only unreferenced sockets; each request is bounded below.
const keepAlive = setInterval(() => {}, 1000);
let success = false, failure = '', imageId = '', bundle = '', profile: PlayerProfile | undefined;
let firstId = '', secondId = '', diskBytes = 0, cleanup = false;
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
async function docker(...args: string[]) { return (await exec('docker', args, { cwd: root, timeout: 45000, maxBuffer: 2 * 1024 * 1024 })).stdout.trim(); }
async function compose(project: string, ...args: string[]) { return docker('compose', '-p', project, '-f', file, ...args); }
async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(10000), method: body === undefined ? 'GET' : 'POST', headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `${path} HTTP ${response.status}`); return await response.json() as T;
}
async function start(project: string): Promise<string> {
  await compose(project, 'up', '-d');
  const until = Date.now() + 30000;
  while (true) {
    try { if ((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(2000) })).ok) break; } catch { /* container boot */ }
    if (Date.now() > until) throw new Error('Conteneur de test indisponible');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return compose(project, 'ps', '-q', 'app');
}
try {
  await mkdir(directory, { mode: 0o700 });
  imageId = await docker('image', 'inspect', image, '--format', '{{.Id}}');
  await writeFile(file, JSON.stringify({ services: { app: { image: imageId, init: true,
    ports: ['127.0.0.1:3105:3000'], environment: { PLAYER_DATA_DIR: '/app/data/players' },
    volumes: [{ type: 'bind', source: directory, target: '/app/data' }], labels: { 'lagon.test': 'accounts-persistence' } } } }));
  await docker('run', '--rm', '--network', 'none', '--user', '0:0', '--entrypoint', 'node',
    '--mount', `type=bind,source=${directory},target=/app/data`, imageId, '-e',
    "const fs=require('node:fs');fs.chownSync('/app/data',1000,1000)");
  firstId = await start(projects[0]!);
  bundle = (await (await fetch(origin, { signal: AbortSignal.timeout(10000) })).text()).match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
  assert.ok(bundle); if (process.env.EXPECTED_BUNDLE) assert.equal(bundle, process.env.EXPECTED_BUNDLE);
  const account = await api<{ token: string; profile: PlayerProfile }>('/api/account/register', undefined, { username, password });
  assert.equal(account.profile.stats.races, 0);
  record('Compte créé par HTTP dans un conteneur isolé avec dossier hôte temporaire');
  await compose(projects[0]!, 'down', '-v');
  // The test intentionally seeds a race result, not a played race. Only this disposable store is edited,
  // with its server stopped, through exactly the same validated persistence methods as the game.
  const replayId = `persistence-${suffix}`;
  const fixtureScript = `
    import { PlayerStore } from './dist/server/player-store.js';
    import { TRACK_LAYOUT_REVISION } from './dist/shared/track.js';
    import { seasonId } from './dist/shared/progression.js';
    const store = await PlayerStore.open('/app/data/players');
    const playerId = process.argv[1], replayId = process.argv[2], now = Date.now();
    await store.recordRace({ id: replayId, trackId: 'sky', ranked: false, finishedAt: now,
      entries: [{ playerId, rank: 1, finished: true, finishTime: 90 }] });
    const profile = store.getProfile(playerId);
    await store.saveReplay({ version: 1, id: replayId, trackId: 'sky', trackRevision: TRACK_LAYOUT_REVISION,
      createdAt: now, durationMs: 90000, season: seasonId(new Date(now)), ranked: false, eventLevel: 0,
      drivers: [{ playerId, name: profile.name, color: '#fc735d', rank: 1, finished: true,
        finishTime: 90, frames: [[0, 0, 0, 0, 0, 0, 0], [90000, 0, 0, 0, 0, 3, 0]] }] });
    await store.flush();
  `;
  await docker('run', '--rm', '--network', 'none', '--entrypoint', 'node',
    '--mount', `type=bind,source=${directory},target=/app/data`, imageId, '--input-type=module', '-e', fixtureScript, account.profile.id, replayId);
  firstId = await start(projects[0]!);
  profile = (await api<{ profile: PlayerProfile }>('/api/me', account.token)).profile;
  assert.equal(profile.id, account.profile.id); assert.equal(profile.stats.races, 1); assert.equal(profile.xp, 45);
  const beforeReplay = (await api<{ replay: ReplayData }>(`/api/replays/${replayId}`)).replay;
  assert.equal(beforeReplay.drivers[0]!.playerId, profile.id);
  const diskBefore = await readFile(join(directory, 'players', 'players.json'), 'utf8');
  diskBytes = Buffer.byteLength(diskBefore);
  assert.ok(!diskBefore.includes(password)); assert.ok(!diskBefore.includes(account.token));
  record('Fixture annoncée : 1 victoire, 45 XP et replay enregistrés ; aucun mot de passe ni jeton en clair dans players.json');
  await compose(projects[0]!, 'down', '-v');
  assert.equal(await readFile(join(directory, 'players', 'players.json'), 'utf8'), diskBefore);
  secondId = await start(projects[1]!); assert.notEqual(firstId, secondId);
  // Deliberately no Authorization header: simulates a different computer / cleared localStorage.
  const recovered = await api<{ token: string; profile: PlayerProfile }>('/api/account/login', undefined, { username, password });
  assert.notEqual(recovered.token, account.token);
  assert.deepEqual(recovered.profile, profile);
  assert.deepEqual((await api<{ profile: PlayerProfile }>('/api/me', recovered.token)).profile, profile);
  assert.deepEqual((await api<{ replay: ReplayData }>(`/api/replays/${replayId}`)).replay, beforeReplay);
  record('compose down -v, nouveau nom de projet et connexion sans ancien jeton : identité, stats, XP et replay identiques');
  const outside = await fetch(origin + '/data/players/players.json', { signal: AbortSignal.timeout(10000) });
  const outsideText = await outside.text();
  assert.ok(!outsideText.includes(profile.id)); assert.ok(!outsideText.includes('tokenHash'));
  const logout = await fetch(origin + '/api/account/logout', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { authorization: `Bearer ${recovered.token}` } });
  assert.ok(logout.ok);
  assert.equal((await fetch(origin + '/api/me', { signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${recovered.token}` } })).status, 401);
  record('Déconnexion : session révoquée et progression conservée sur le disque hôte');
  success = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error); throw error;
} finally {
  try {
  await Promise.all(projects.map(project => compose(project, 'down', '-v').catch(() => {})));
  await rm(temp, { recursive: true, force: true }); cleanup = true;
  const report = resolve(root, process.env.REPORT_PATH ?? 'docs/accounts-persistence.json');
  await mkdir(resolve(report, '..'), { recursive: true });
  await writeFile(report, JSON.stringify({ success, failure, checks, imageId, bundle, firstId, secondId, diskBytes,
    durationSeconds: (Date.now() - started) / 1000, method: 'Real HTTP registration/login, stopped-server progression/replay fixture, host bind mount, compose down -v, different compose project, fresh session.',
    playedRace: false, fixture: { races: 1, xp: 45, replay: true },
    publicAppTouched: false, publicTunnelTouched: false, userDataTouched: false, temporaryDataRemoved: cleanup }, null, 2));
  } finally { clearInterval(keepAlive); }
}
