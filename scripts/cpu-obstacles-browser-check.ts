import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { config } from '../server/config.js';
import { neutralInput, type Kart, type World } from '../shared/game.js';
import { getTrack, nearestTrack, trackElevation, trackPoint } from '../shared/track.js';
import { getTrackEvent, nearestDriveableTrack } from '../shared/track-events.js';

// Private integration fixture, not a public-game administrative endpoint. All
// placements happen during the countdown. A real finish-line crossing triggers
// the road closure; RaceRoom then owns every CPU input, movement and checkpoint.
const destination = resolve(process.env.DESTINATION || 'docs/cpu-obstacles');
await mkdir(destination, { recursive: true });
const dataDirectory = await mkdtemp(join(tmpdir(), 'lagon-cpu-obstacles-'));
const previousDirectory = process.env.PLAYER_DATA_DIR;
process.env.PLAYER_DATA_DIR = dataDirectory;
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage(); page.setDefaultTimeout(45000);
type Debug = { world: World | null; sessionId: string; connected: boolean; kartAssets: { status: string };
  view: { tracked: { id: string; position: number[]; projected: number[] } | null; camera: unknown; calls: number; triangles: number } };
const debug = (): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const errors: string[] = [], checks: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = {}, fixtures: string[] = [];
const clients: Room[] = [], inputTimers = new Set<ReturnType<typeof setInterval>>();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(condition: () => boolean | Promise<boolean>, label: string, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (!await condition()) { if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label); await wait(35); }
}
function record(label: string) { checks.push(label); console.log('✓ ' + label); }
function pose(kart: Kart) { return { x: kart.x, z: kart.z, speed: kart.speed, lap: kart.lap, nextCheckpoint: kart.nextCheckpoint,
  progress: kart.progress, lastSeq: kart.lastSeq, resetCooldown: kart.resetCooldown, eventStage: kart.eventStage,
  branchId: nearestDriveableTrack(kart.x, kart.z, kart.trackId, kart.eventStage, kart.eventLevel).branchId }; }
function place(kart: Kart, progress: number) {
  const track = getTrack(kart.trackId), point = trackPoint(progress, track.id);
  const nextCheckpoint = (Math.floor(progress / (track.length / track.checkpoints.length)) + 1) % track.checkpoints.length;
  const previousGate = track.checkpoints[(nextCheckpoint + track.checkpoints.length - 1) % track.checkpoints.length]!;
  Object.assign(kart, point, { speed: 22, progress, nextCheckpoint, elevation: trackElevation(progress, track.id),
    respawnX: previousGate.x + Math.sin(previousGate.angle) * 2,
    respawnZ: previousGate.z + Math.cos(previousGate.angle) * 2, respawnAngle: previousGate.angle });
}
async function capture(name: string, cpu: Kart) {
  await until(async () => {
    const state = await debug(), rendered = state.view.tracked;
    const received = state.world?.players.find(kart => kart.id === cpu.id);
    return rendered?.id === cpu.id && !!received && Math.hypot(received.x - cpu.x, received.z - cpu.z) < .05 &&
      Math.hypot(rendered.position[0]! - cpu.x, rendered.position[2]! - cpu.z) < .2;
  }, 'CPU autoritaire reçu et rendu ' + name);
  await wait(900);
  const state = await debug(), tracked = state.view.tracked!;
  assert.ok(Math.abs(tracked.projected[0]!) < .95 && Math.abs(tracked.projected[1]!) < .95 && tracked.projected[2]! < 1,
    'CPU dans le cadrage ' + name);
  assert.equal(state.world?.players.find(kart => kart.id === state.sessionId)?.spectator, true);
  const filename = name + '.png'; await page.screenshot({ path: join(destination, filename) }); captures.push(filename);
  return { rendered: tracked, camera: state.view.camera, calls: state.view.calls, triangles: state.view.triangles };
}

try {
  const html = await fetch(origin).then(response => response.text());
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  evidence.serverSources = Object.fromEntries(await Promise.all(['shared/cpu.ts', 'shared/autopilot.ts', 'shared/game.ts', 'shared/track-events.ts', 'server/RaceRoom.ts']
    .map(async file => [file, createHash('sha256').update(await readFile(resolve(file))).digest('hex')])));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __lagonDebug?: Debug }).__lagonDebug?.kartAssets.status === 'ready');
  for (const scenario of [{ trackId: 'mangrove', side: 'after' }, { trackId: 'castle', side: 'before' }] as const) {
    const track = getTrack(scenario.trackId), event = getTrackEvent(track.id, 1, 3), blocker = event.blockers[0]!;
    const blockerProgress = nearestTrack(blocker.x, blocker.z, track.id).progress;
    const startProgress = blockerProgress + (scenario.side === 'after' ? blocker.halfLength + 2 : -blocker.halfLength - 1.3);
    const sdk = new Client(origin.replace(/^http/, 'ws'));
    const room = await sdk.create('race', { trackId: track.id, name: 'Déclencheur du tour' }); clients.push(room);
    room.onMessage('notice', () => {});
    let snapshotCount = 0; room.onMessage('snapshot', () => snapshotCount++);
    const live = matchMaker.getLocalRoomById(room.roomId) as RaceRoom; assert.ok(live);
    room.send('configure', { eventLevel: 3 }); room.send('configure', { cpuCount: 1 }); room.send('ready', { ready: true });
    await until(() => live.world.players.filter(kart => kart.cpu).length === 1 && live.world.players.every(kart => kart.ready), 'CPU prêt');
    room.send('start'); await until(() => live.world.phase === 'countdown', 'compte à rebours');
    live.setSimulationInterval(() => {}, 1000 / config.simHz);
    const cpu = live.world.players.find(kart => kart.cpu)!, leader = live.world.players.find(kart => kart.id === room.sessionId)!;
    place(cpu, startProgress); place(leader, track.length - .25);
    // Stable observer target; this changes only initial array order, not rank.
    live.world.players = [cpu, leader];
    live.world.pickups = [];
    fixtures.push(`${track.id} : compte à rebours privé suspendu avant tout déplacement ; CPU placé ${scenario.side === 'after' ? 'juste après' : 'juste avant'} le futur barrage à la progression ${startProgress.toFixed(3)}, vitesse 22. Checkpoints antérieurs et point de replacement cohérents constituent la fixture, ils ne sont pas une course effectuée. Pilote SDK à 0,25 m avant la ligne avec les checkpoints antérieurs validés ; son franchissement réel déclenche la fermeture. Ordre initial CPU/pilote pour la caméra spectateur, objets retirés avant départ pour isoler le blocage. Ensuite aucune mutation des positions, tours ou checkpoints.`);
    await page.locator('#code-input').fill(room.roomId); await page.locator('#join-button').click();
    await until(async () => { const state = await debug(); return state.world?.players.some(kart => kart.id === state.sessionId && kart.spectator) ?? false; }, 'observateur connecté');
    const before = pose(cpu), beforeView = await capture(`${track.id}-before-closure`, cpu);
    const gateSerial = () => cpu.lap * track.checkpoints.length + (cpu.nextCheckpoint || track.checkpoints.length);
    const startingGate = gateSerial();
    let closure: ReturnType<typeof pose> | undefined, closureTime = -1, resets = 0, previousCooldown = cpu.resetCooldown;
    let lowSpeedSeconds = 0, maximumLowSpeedSeconds = 0, done = false, failed = '';
    const samples: Array<ReturnType<typeof pose> & { time: number; validatedGates: number }> = [];
    let nextSample = 0, previousRaceTime = 0;
    const originalUpdate = (live as unknown as { update(deltaMs: number): void }).update.bind(live);
    const tick = (deltaMs: number) => {
      originalUpdate(deltaMs);
      const elapsed = live.world.raceTime - previousRaceTime; previousRaceTime = live.world.raceTime;
      if (live.world.eventStage === 1 && !closure) { closure = pose(cpu); closureTime = live.world.raceTime; }
      if (cpu.resetCooldown > previousCooldown + .3) resets++;
      previousCooldown = cpu.resetCooldown;
      if (closure && elapsed > 0) {
        lowSpeedSeconds = Math.abs(cpu.speed) < 3 ? lowSpeedSeconds + elapsed : 0;
        maximumLowSpeedSeconds = Math.max(maximumLowSpeedSeconds, lowSpeedSeconds);
        if (live.world.raceTime >= nextSample) { samples.push({ time: live.world.raceTime, ...pose(cpu), validatedGates: gateSerial() - startingGate }); nextSample = live.world.raceTime + .5; }
        if (gateSerial() - startingGate >= 2) done = true;
        else if (live.world.raceTime - closureTime >= 20) failed = 'Deux checkpoints non franchis dans les 20 secondes après fermeture';
        if (done || failed) live.setSimulationInterval(() => {}, 1000 / config.simHz);
      }
    };
    let sequence = 0;
    const inputTimer = setInterval(() => {
      if (room.connection.isOpen) room.send('input', { ...neutralInput(sequence++, leader.epoch), throttle: live.world.eventStage === 0 ? 1 : 0 });
    }, 1000 / 20); inputTimers.add(inputTimer);
    const initialSnapshots = snapshotCount;
    live.setSimulationInterval(tick, 1000 / config.simHz);
    await until(() => done || !!failed, 'CPU libère le secteur ' + track.id, 80000);
    clearInterval(inputTimer); inputTimers.delete(inputTimer);
    const after = pose(cpu), afterView = await capture(`${track.id}-after-checkpoints`, cpu);
    evidence[track.id] = { side: scenario.side, before, closure, after, closureTime, elapsedAfterClosure: live.world.raceTime - closureTime,
      gatesEarned: gateSerial() - startingGate, resets, maximumLowSpeedSeconds, snapshots: snapshotCount - initialSnapshots,
      beforeView, afterView, samples, failure: failed || undefined };
    assert.equal(failed, ''); assert.ok(closure); assert.equal(leader.lap, 1, 'Fermeture déclenchée par passage réel du pilote');
    assert.ok(resets <= 2, 'Remises en piste bornées, aucune boucle de téléportation');
    assert.ok(cpu.lastSeq > before.lastSeq + 20, 'Entrées CPU produites par RaceRoom');
    assert.ok(snapshotCount > initialSnapshots + 5, 'Snapshots reçus pendant la conduite');
    assert.ok(maximumLowSpeedSeconds < 8, 'Aucune immobilisation persistante contre un mur');
    record(`${track.name} : vraie fermeture déclenchée par un tour, CPU franchit ${gateSerial() - startingGate} checkpoints en ${(live.world.raceTime - closureTime).toFixed(2)} s de simulation, ${resets} replacement(s), rendu reçu par le navigateur.`);
    await page.locator('#leave-button').click(); await until(async () => !(await debug()).world, 'sortie observateur');
    await room.leave(true); clients.splice(clients.indexOf(room), 1);
  }
  assert.deepEqual(errors, []); record('Aucune erreur JavaScript ni ressource HTTP manquante.');
  await writeFile(join(destination, 'browser-validation.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), checks, errors, captures, evidence, fixtures,
    visualReview: { status: 'pending', note: 'Inspecter les quatre captures avant de confirmer la présentation visuelle.' },
    limitations: ['Serveur privé et données temporaires ; aucun joueur public déplacé.', 'Deux fixtures de secteur, aucune course complète et aucun classement artificiellement attribué.',
      'La simulation privée est suspendue avant départ puis après les deux checkpoints réellement atteints pour photographier les poses ; aucun état de course ne change pendant ces pauses. Les durées mesurées sont des secondes de simulation.',
      'Les captures montrent les positions réellement atteintes avant fermeture puis après deux checkpoints, pas une comparaison avec une ancienne version du code.',
      'Chromium headless avec SwiftShader, un observateur et un client SDK ; aucune mesure sur téléphone ou deux machines physiques.'] }, null, 2) + '\n');
} catch (error) {
  process.exitCode = 1; console.error(error);
  await writeFile(join(destination, 'browser-validation.json'), JSON.stringify({ passed: false, at: new Date().toISOString(), failure: String(error), checks, errors, captures, evidence, fixtures }, null, 2) + '\n');
} finally {
  for (const timer of inputTimers) clearInterval(timer);
  for (const room of clients) await room.leave(true).catch(() => {});
  await browser.close(); await gameServer.gracefullyShutdown(false);
  await rm(dataDirectory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
}
