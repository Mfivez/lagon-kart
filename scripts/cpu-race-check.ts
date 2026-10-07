import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { getTrack, nearestTrack, type World } from '../shared/game.js';
import { nearestDriveableTrack } from '../shared/track-events.js';
import type { PlayerProfile } from '../shared/progression.js';

// Public interfaces only. Seven CPU are controlled by RaceRoom itself; this
// observer sends ordinary driving commands for the single authenticated human.
const origin = process.env.BASE_URL?.replace(/\/$/, '');
assert.ok(origin && /^https?:\/\//.test(origin), 'BASE_URL requis pour choisir explicitement le serveur à vérifier.');
const reportPath = process.env.REPORT_PATH || 'docs/cpu-obstacles/public-race.json';
const trackId = 'mangrove', track = getTrack(trackId);
const started = Date.now(), checks: string[] = [], notices: string[] = [], errors: string[] = [];
const stages = new Set<number>(), detourCpu = new Set<string>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Health = { status: string; rooms: number };
type Observation = { cpu: boolean; name: string; bestProgress: number; lastAdvance: number;
  maximumNoProgressSeconds: number; previousResetCooldown: number; observedResets: number; snapshots: number };
const observations = new Map<string, Observation>();
let room: Room | undefined, world: World | undefined, timer: ReturnType<typeof setInterval> | undefined;
let initialHealth: Health | undefined, finalHealth: Health | undefined, savedProfile: PlayerProfile | undefined;
let sequence = 0, epoch = -1, snapshots = 0, commands = 0, success = false, failure = '', bundle = '';
let results: Array<{ id: string; cpu: boolean; rank: number; lap: number; finished: boolean; finishTime: number }> = [];
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function until(condition: () => boolean | Promise<boolean>, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!await condition()) { if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label); await sleep(80); }
}
async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, path + ': HTTP ' + response.status); return await response.json() as T;
}
try {
  initialHealth = await api<Health>('/healthz');
  assert.equal(initialHealth.status, 'ok');
  assert.equal(initialHealth.rooms, 0, 'Lancer ce contrôle lorsque le serveur est libre.');
  const html = await (await fetch(origin)).text(); bundle = /src="([^"\s]+\/index-[^"\s]+\.js)"/.exec(html)?.[1] ?? '';
  const account = await api<{ token: string; profile: PlayerProfile }>('/api/profile', undefined, { name: 'Contrôle CPU mangrove' });
  assert.equal(account.profile.stats.races, 0);
  room = await new Client(origin.replace(/^http/, 'ws')).create('race', {
    name: account.profile.name, token: account.token, color: '#ff735d', trackId,
  });
  room.onMessage('notice', (notice: { message: string }) => {
    notices.push(notice.message); if (/échoué|erreur/i.test(notice.message)) errors.push(notice.message);
  });
  room.onError((code, message) => { errors.push('Colyseus ' + code + ': ' + (message ?? '')); });
  room.onMessage('snapshot', (snapshot: { world: World }) => {
    world = snapshot.world; snapshots++;
    if (world.phase !== 'racing' && world.phase !== 'finished') return;
    stages.add(world.eventStage);
    for (const kart of world.players.filter(player => !player.spectator)) {
      const observation = observations.get(kart.id) ?? { cpu: kart.cpu, name: kart.name, bestProgress: kart.progress,
        lastAdvance: world.raceTime, maximumNoProgressSeconds: 0, previousResetCooldown: 0, observedResets: 0, snapshots: 0 };
      if (kart.progress > observation.bestProgress + .5) {
        observation.bestProgress = kart.progress; observation.lastAdvance = world.raceTime;
      }
      if (!kart.finished) observation.maximumNoProgressSeconds = Math.max(observation.maximumNoProgressSeconds, world.raceTime - observation.lastAdvance);
      if (kart.resetCooldown > observation.previousResetCooldown + .5) observation.observedResets++;
      observation.previousResetCooldown = kart.resetCooldown; observation.snapshots++; observations.set(kart.id, observation);
      if (kart.cpu && world.eventStage > 0 && !detourCpu.has(kart.id)) {
        const near = nearestDriveableTrack(kart.x, kart.z, trackId, world.eventStage, world.eventLevel);
        if (near.branchId === trackId + '-detour' && nearestTrack(kart.x, kart.z, trackId).distance > track.width / 2 + 3) detourCpu.add(kart.id);
      }
    }
  });
  await until(() => Boolean(world), 'premier snapshot');
  assert.equal(world!.trackId, trackId);
  assert.equal(world!.players.find(kart => kart.id === room!.sessionId)?.playerId, account.profile.id);
  room.send('configure', { eventLevel: 3 });
  await until(() => world?.eventLevel === 3, 'événements niveau 3');
  room.send('configure', { cpuCount: 7 });
  await until(() => world?.players.filter(kart => kart.cpu).length === 7, 'sept CPU serveur');
  assert.equal(world!.players.length, 8); assert.ok(world!.players.filter(kart => kart.cpu).every(kart => kart.ready));
  record('Salon mangrove : un invité authentifié et sept CPU créés par la configuration publique du serveur');
  room.send('ready', { ready: true });
  await until(() => world!.players.every(kart => kart.ready), 'pilotes prêts');
  room.send('start');
  await until(() => world?.phase === 'racing', 'départ');
  timer = setInterval(() => {
    const kart = world?.players.find(player => player.id === room?.sessionId);
    if (!kart || !room?.connection.isOpen || kart.finished || world?.phase !== 'racing') return;
    if (kart.epoch !== epoch) { epoch = kart.epoch; sequence = Math.max(0, kart.lastSeq + 1); }
    room.send('input', autopilot(kart, sequence++, true)); commands++;
  }, 1000 / 30);
  let nextLog = 0;
  await until(() => {
    if (Date.now() > nextLog) {
      nextLog = Date.now() + 15000;
      console.log(world!.players.map(kart => `${kart.name} : ${kart.lap}/3, porte ${kart.nextCheckpoint}`).join(' · '));
    }
    return world?.phase === 'finished';
  }, 'course complète avec sept CPU', 240000);
  clearInterval(timer); timer = undefined;
  const racers = world!.players.filter(kart => !kart.spectator);
  assert.equal(racers.length, 8); assert.equal(racers.filter(kart => kart.cpu).length, 7);
  assert.ok(racers.every(kart => kart.finished && kart.lap === 3), 'Les huit pilotes doivent terminer physiquement leurs trois tours.');
  assert.equal(new Set(racers.map(kart => kart.rank)).size, 8);
  assert.deepEqual([...stages].sort(), [0, 1, 2]); assert.equal(detourCpu.size, 7);
  results = racers.map(kart => ({ id: kart.id, cpu: kart.cpu, rank: kart.rank, lap: kart.lap, finished: kart.finished, finishTime: kart.finishTime }));
  record('8/8 arrivées, trois phases, sept CPU observés sur la déviation ouverte et classement distinct');
  for (const observation of observations.values()) if (observation.cpu) {
    assert.ok(observation.maximumNoProgressSeconds < 12, observation.name + ' a stagné trop longtemps.');
    assert.ok(observation.observedResets <= 3, observation.name + ' a répété trop de resets.');
  }
  record('Aucun CPU bloqué 12 secondes ; les remontées de resetCooldown sont comptées dans le rapport');
  await until(async () => {
    savedProfile = (await api<{ profile: PlayerProfile }>('/api/me', account.token)).profile;
    return savedProfile.stats.races === 1 && savedProfile.stats.finishes === 1;
  }, 'progression issue de la course enregistrée');
  assert.deepEqual(errors, []); record('Progression de la course réelle sauvegardée ; aucune erreur serveur ou Colyseus observée');
  success = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  clearInterval(timer);
  if (room?.connection.isOpen) await room.leave().catch(error => { errors.push('Sortie du salon : ' + String(error)); });
  try {
    await until(async () => { finalHealth = await api<Health>('/healthz'); return finalHealth.status === 'ok' && finalHealth.rooms === 0; }, 'salon libéré', 15000);
    record('Salon fermé ; healthz indique status ok et rooms 0');
  } catch (error) {
    success = false; failure ||= error instanceof Error ? error.message : String(error);
  }
  if (errors.length) success = false;
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ origin, trackId, bundle, success, failure, checks, errors, notices,
    startedAt: new Date(started).toISOString(), durationSeconds: (Date.now() - started) / 1000,
    inputMethod: 'One SDK guest sends ordinary input controls; seven bots are driven only by RaceRoom. No server fixture, forced checkpoint, finish or XP mutation.',
    browser: false, initialHealth, finalHealth, snapshots, commands, stages: [...stages].sort(), detourCpu: [...detourCpu],
    observations: [...observations].map(([id, observation]) => ({ id, ...observation })), results,
    resetMeasurement: 'Observed rises of resetCooldown > 0.5 seconds between received snapshots; no private server instrumentation.',
    savedProfile: savedProfile ? { id: savedProfile.id, xp: savedProfile.xp, stats: savedProfile.stats } : null }, null, 2) + '\n');
}
assert.ok(success, failure || errors.join('; ') || 'Course CPU non validée.');
