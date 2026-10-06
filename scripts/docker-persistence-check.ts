import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import type { World } from '../shared/game.js';
import type { GhostData, PlayerProfile, ReplayData, ReplaySummary } from '../shared/progression.js';

const exec = promisify(execFile), image = 'lagon-kart-app:latest';
const suffix = randomUUID().slice(0, 8), container = `lagon-persistence-check-${suffix}`, volume = `${container}-data`;
const origin = 'http://127.0.0.1:3104', checks: string[] = [];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const started = Date.now();
let success = false, failure = '', containerCreated = false, volumeCreated = false;
let containerRemoved = false, volumeRemoved = false, room: Room | undefined, timer: ReturnType<typeof setInterval> | undefined;
let profileBefore: PlayerProfile | undefined, profileAfter: PlayerProfile | undefined, replayBefore: ReplayData | undefined;
let imageId = '', firstContainerId = '', secondContainerId = '', bundle = '';
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
async function docker(...args: string[]) { return (await exec('docker', args, { maxBuffer: 1024 * 1024 })).stdout.trim(); }
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`); await sleep(100); }
}
async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`); return await response.json() as T;
}
async function startContainer() {
  const id = await docker('run', '-d', '--name', container, '--label', 'lagon.test=persistence', '--init',
    '-p', '127.0.0.1:3104:3000', '-e', 'PLAYER_DATA_DIR=/app/data/players', '-e', 'RECONNECT_SECONDS=1',
    '--mount', `type=volume,source=${volume},target=/app/data`, imageId);
  containerCreated = true;
  await until(async () => { try { return (await fetch(origin + '/healthz')).ok; } catch { return false; } }, 'conteneur prêt');
  return id;
}
try {
  await mkdir('docs', { recursive: true });
  imageId = await docker('image', 'inspect', image, '--format', '{{.Id}}');
  await docker('volume', 'create', '--label', 'lagon.test=persistence', volume); volumeCreated = true;
  firstContainerId = await startContainer();
  const html = await (await fetch(origin)).text();
  bundle = html.match(/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? '';
  assert.equal(bundle, 'index-CU-Fug6i.js');
  record('Image finale exacte démarrée sur le port local 3104 avec un volume temporaire distinct');
  const account = await api<{ token: string; profile: PlayerProfile }>('/api/profile', undefined, { name: 'Test sauvegarde' });
  assert.equal(account.profile.stats.races, 0);
  const sdk = new Client(origin.replace(/^http/, 'ws'));
  room = await sdk.create('race', { token: account.token, name: account.profile.name, practice: true, trackId: 'sky', modelId: 'retro', characterId: 'queen' });
  let world: World | undefined, sequence = 0, epoch = -1;
  const notices: string[] = [];
  room.onMessage('notice', (notice: { message: string }) => notices.push(notice.message));
  room.onMessage('snapshot', (snapshot: { world: World }) => { world = snapshot.world; });
  await until(() => world?.players.length === 1, 'pilote dans le salon');
  room.send('ready', { ready: true });
  await until(() => world!.players[0]!.ready, 'pilote prêt'); room.send('start');
  await until(() => world?.phase === 'racing', 'départ');
  const activeRoom = room;
  timer = setInterval(() => {
    const kart = world?.players.find(player => player.id === activeRoom.sessionId);
    if (!kart || kart.finished || !activeRoom.connection.isOpen) return;
    if (kart.epoch !== epoch) { epoch = kart.epoch; sequence = Math.max(0, kart.lastSeq + 1); }
    activeRoom.send('input', autopilot(kart, sequence++, true));
  }, 1000 / 30);
  let nextLog = 0;
  await until(() => {
    if (Date.now() > nextLog) { nextLog = Date.now() + 15000; console.log(`Course de persistance : tour ${world?.players[0]?.lap}/3`); }
    return world?.phase === 'finished';
  }, 'course solo de trois tours', 280000);
  clearInterval(timer); timer = undefined;
  assert.equal(world!.players[0]!.lap, 3); assert.equal(world!.players[0]!.finished, true);
  assert.ok(!notices.some(notice => /sauvegarde.*échoué/i.test(notice)));
  await until(async () => {
    profileBefore = (await api<{ profile: PlayerProfile }>('/api/me', account.token)).profile;
    return profileBefore.stats.races === 1 && profileBefore.stats.finishes === 1;
  }, 'profil sauvegardé');
  let replayId = '';
  await until(async () => {
    const list = await api<{ replays: ReplaySummary[] }>('/api/replays', account.token);
    replayId = list.replays[0]?.id ?? ''; return Boolean(replayId);
  }, 'replay sauvegardé');
  replayBefore = (await api<{ replay: ReplayData }>(`/api/replays/${replayId}`)).replay;
  assert.equal(replayBefore.drivers[0]!.frames.at(-1)![5], 3);
  const ghostBefore = (await api<{ ghost: GhostData | null }>('/api/ghost?track=sky&level=3')).ghost;
  assert.equal(ghostBefore?.replayId, replayId);
  const serialized = JSON.stringify({ profileBefore, replayBefore, ghostBefore });
  assert.ok(!serialized.includes(account.token));
  record('Une course réelle de trois tours a créé statistiques, XP, replay et ghost par les interfaces publiques');
  await room.leave(); room = undefined;
  await docker('rm', '-f', container); containerCreated = false;
  secondContainerId = await startContainer();
  assert.notEqual(firstContainerId, secondContainerId);
  profileAfter = (await api<{ profile: PlayerProfile }>('/api/me', account.token)).profile;
  const replayAfter = (await api<{ replay: ReplayData }>(`/api/replays/${replayId}`)).replay;
  const ghostAfter = (await api<{ ghost: GhostData | null }>('/api/ghost?track=sky&level=3')).ghost;
  assert.deepEqual(profileAfter, profileBefore); assert.deepEqual(replayAfter, replayBefore); assert.deepEqual(ghostAfter, ghostBefore);
  record('Conteneur recréé avec le même volume : identité, profil, statistiques, replay et ghost strictement identiques');
  success = true;
} catch (error) { failure = error instanceof Error ? error.message : String(error); throw error;
} finally {
  clearInterval(timer);
  if (room?.connection.isOpen) await room.leave().catch(() => {});
  if (containerCreated) { await docker('rm', '-f', container); containerRemoved = true; }
  if (volumeCreated) { await docker('volume', 'rm', volume); volumeRemoved = true; }
  await writeFile('docs/docker-persistence.json', JSON.stringify({ success, failure, checks, image, imageId, bundle,
    origin, container, volume, firstContainerId, secondContainerId, durationSeconds: (Date.now() - started) / 1000,
    method: 'Isolated temporary Docker volume; authenticated API profile; real solo race through ordinary SDK inputs; remove and recreate container; compare persisted public data.',
    publicAppTouched: false, publicTunnelTouched: false, userVolumeTouched: false,
    profile: profileAfter ?? profileBefore ?? null,
    replay: replayBefore ? { id: replayBefore.id, trackId: replayBefore.trackId, eventLevel: replayBefore.eventLevel,
      durationMs: replayBefore.durationMs, frames: replayBefore.drivers.map(driver => driver.frames.length) } : null,
    cleanup: { containerRemoved, volumeRemoved } }, null, 2));
}
