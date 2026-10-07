import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { config } from '../server/config.js';
import type { Kart, World } from '../shared/game.js';
import { TRACKS, nearestTrack, trackPoint } from '../shared/track.js';
import { kartLoopPose } from '../shared/track-loop.js';
import { autopilot } from '../shared/autopilot.js';

// Scene fixtures run in an ephemeral local room. Neither production state nor
// the player's authenticated profile is touched by this diagnostic.
const destination = resolve(process.env.DESTINATION || 'docs/scenes-v2'); await mkdir(destination, { recursive: true });
const panoramasOnly = process.argv.includes('--panoramas-only');
const loopsOnly = process.argv.includes('--loops-only');
const dataDirectory = await mkdtemp(join(tmpdir(), 'lagon-scenes-'));
const previousDirectory = process.env.PLAYER_DATA_DIR; process.env.PLAYER_DATA_DIR = dataDirectory;
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
// One context and one rendered page for every panorama and loop capture.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage(); page.setDefaultTimeout(60000);
type View = { camera: { position: number[]; target: number[]; fov: number; near: number };
  tracked: { id: string; position: number[]; up: number[]; projected: number[] } | null;
  calls: number; triangles: number; compact: boolean };
type Debug = { world: World | null; sessionId: string; connected: boolean; view: View;
  sceneryAssets: { state: string; url: string; requests: number }; kartAssets: { status: string } };
const debug = (): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const checks: string[] = [], errors: string[] = [], captures: string[] = [], fixtures: string[] = [];
const evidence: Record<string, unknown> = { validationScope: { panoramas: !loopsOnly, loops: !panoramasOnly } }, treeRequests: string[] = [];
const activeRooms: Room[] = [], intervals = new Set<ReturnType<typeof setInterval>>();
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
page.on('request', request => {
  if (request.url().includes('kenney-tree-v1.glb')) treeRequests.push(request.url());
  if (/\.(glb|mp3)(?:\?|$)/.test(request.url()) && new URL(request.url()).origin !== origin) errors.push('Asset outside same origin: ' + request.url());
});
function record(message: string) { checks.push(message); console.log('✓ ' + message); }
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label); await wait(40); }
}
async function capture(name: string) { const file = name + '.png'; await page.screenshot({ path: join(destination, file) }); captures.push(file); }
async function leavePage() {
  if ((await debug()).world) { await page.locator('#leave-button').click(); await until(async () => !(await debug()).world, 'sortie observateur'); }
}
async function measure(kart: Kart, label: string, inverted = false) {
  const pose = kartLoopPose(kart);
  await until(async () => {
    const view = (await debug()).view;
    if (view.tracked?.id !== kart.id) return false;
    const point = view.tracked.position;
    return Math.hypot(point[0] - pose.x, point[1] - pose.y, point[2] - pose.z) < .18;
  }, label + ' : pose autoritaire reçue et rendue');
  await wait(1000);
  const state = await debug(), tracked = state.view.tracked!;
  const error = Math.hypot(tracked.position[0] - pose.x, tracked.position[1] - pose.y, tracked.position[2] - pose.z);
  assert.ok(error < .18, label + ' : position rendue partagée');
  assert.ok(Math.abs(tracked.up[0] - pose.up.x) < .025 && Math.abs(tracked.up[1] - pose.up.y) < .025 && Math.abs(tracked.up[2] - pose.up.z) < .025,
    label + ' : orientation 3D partagée');
  assert.ok(Math.abs(tracked.projected[0]) < .95 && Math.abs(tracked.projected[1]) < .95 && tracked.projected[2] < 1,
    label + ' : kart cadré, projection ' + tracked.projected.join(','));
  if (inverted) assert.ok(tracked.up[1] < -.8, label + ' : kart réellement inversé');
  assert.equal(await page.locator('#touch-controls').isVisible(), false, 'spectateur mobile sans commandes de conduite');
  const own = state.world!.players.find(player => player.id === state.sessionId); assert.ok(own?.spectator);
  evidence[label] = { logical: { x: kart.x, z: kart.z, elevation: kart.elevation, loopId: kart.loopId, speed: kart.speed, lastSeq: kart.lastSeq },
    sharedPose: pose, rendered: tracked, camera: state.view.camera, positionError: error,
    calls: state.view.calls, triangles: state.view.triangles };
}

try {
  const html = await fetch(origin).then(response => response.text());
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const value = (window as unknown as { __lagonDebug?: Debug }).__lagonDebug;
    return value?.sceneryAssets.state === 'ready' && value.kartAssets.status === 'ready';
  }, undefined, { timeout: 60000 });
  assert.equal(await page.locator('#track-cards [data-track]').count(), 12);
  if (!loopsOnly) {
    for (const track of TRACKS) {
      await page.locator(`#track-cards [data-track="${track.id}"]`).click();
      await until(async () => (await page.locator('#track-name').textContent()) === track.name, 'sélection ' + track.id);
      await wait(1500);
      const hide = await page.addStyleTag({ content: '.menu,.screen-wash,.topbar,.bottom-bar{visibility:hidden!important}' });
      await capture(track.id + '-overview'); await hide.evaluate(node => (node as Element).remove());
      const state = await debug(); evidence[track.id + '-overview'] = { view: state.view, scenery: state.sceneryAssets };
      record(track.name + ' : panorama choisi dans le menu, scène rendue.');
    }
    fixtures.push('Les 12 panoramas utilisent la caméra d’accueil et une sélection normale de circuit. Les panneaux HTML sont masqués seulement pendant chaque capture du décor.');
  }
  assert.equal(treeRequests.length, 1, 'un téléchargement Kenney par page après tous les changements de circuit');
  assert.equal((await debug()).sceneryAssets.requests, 1);
  record('GLB Kenney servi depuis la même origine, une requête et un chargement sur toute la page.');

  for (const track of panoramasOnly ? [] : TRACKS.filter(track => track.loops.length)) {
    await leavePage(); await page.setViewportSize({ width: 1440, height: 900 });
    const sdk = new Client(origin.replace(/^http/, 'ws'));
    const room = await sdk.create('race', { practice: true, trackId: track.id, name: 'Pilote looping', modelId: 'zsky', color: '#ff795c' });
    activeRooms.push(room); let snapshot: World | undefined, sequence = 0, epoch = -1, snapshots = 0;
    room.onMessage('snapshot', (message: { world: World }) => { snapshot = message.world; snapshots++; });
    room.onMessage('notice', () => {});
    const live = matchMaker.getLocalRoomById(room.roomId) as RaceRoom; assert.ok(live);
    room.send('configure', { eventLevel: 0 }); room.send('ready', { ready: true });
    await until(() => live.world.eventLevel === 0 && live.world.players.every(kart => kart.ready), 'prêt ' + track.id);
    room.send('start'); await until(() => live.world.phase === 'racing', 'départ ' + track.id);
    // A solo room normally has one seat. Add one spectator seat only in this
    // private diagnostic; there is still exactly one competing kart.
    live.maxClients = 2; await live.unlock();
    await page.locator('#code-input').fill(room.roomId); await page.locator('#join-button').click();
    await until(async () => { const state = await debug(); return state.world?.players.some(kart => kart.id === state.sessionId && kart.spectator) ?? false; }, 'observateur ' + track.id);
    const kart = live.world.players.find(kart => kart.id === room.sessionId)!;
    const loop = track.loops[0]!;
    // A grounded starting fixture just before the entrance. Every subsequent
    // altitude, loopId, pitch and position is produced by ordinary simulation.
    Object.assign(kart, trackPoint(loop.start - 3, track.id), { speed: 0, turnVelocity: 0, lateralVelocity: 0 });
    assert.equal(kart.elevation, 0); assert.equal(kart.loopId, ''); assert.equal(kart.airborne, false);
    fixtures.push(`${track.id} : une place spectateur ajoutée au salon solo privé ; kart posé au sol 3 m avant l’entrée, vitesse initiale nulle. Événements désactivés par configure normal. Ensuite uniquement commandes SDK ordinaires ; aucune altitude, orientation ou loopId imposés.`);
    let targetFraction = .25, paused = false, pauses = 0, entered = false, exited = false, maximumElevation = 0;
    const reached: Array<{ fraction: number; time: number; elevation: number; sequence: number }> = [];
    const originalUpdate = (live as unknown as { update(deltaMs: number): void }).update.bind(live);
    const tick = (deltaMs: number) => {
      originalUpdate(deltaMs);
      const pose = kartLoopPose(kart); maximumElevation = Math.max(maximumElevation, pose.y);
      if (pose.active) entered = true;
      if (entered && !pose.active && nearestTrack(kart.x, kart.z, track.id).progress > loop.end) exited = true;
      if (!paused && pose.active && pose.fraction >= targetFraction) {
        paused = true; pauses++; reached.push({ fraction: pose.fraction, time: live.world.raceTime, elevation: kart.elevation, sequence: kart.lastSeq });
        live.setSimulationInterval(() => {}, 1000 / config.simHz);
      }
    };
    live.setSimulationInterval(tick, 1000 / config.simHz);
    const timer = setInterval(() => {
      const current = snapshot?.players.find(player => player.id === room.sessionId);
      if (!current || !room.connection.isOpen) return;
      if (current.epoch !== epoch) { epoch = current.epoch; sequence = Math.max(0, current.lastSeq + 1); }
      room.send('input', autopilot(current, sequence++));
    }, 1000 / 30); intervals.add(timer);
    for (const [fraction, name] of [[.25, 'ascent'], [.5, 'inverted'], [.75, 'descent'], [.82, 'exit-turn']] as const) {
      await until(() => paused, track.id + ' : fraction ' + fraction, 45000);
      const reachedPose = kartLoopPose(kart); assert.ok(reachedPose.active && reachedPose.fraction >= fraction && reachedPose.fraction < fraction + .06);
      const beforeSnapshots = snapshots;
      await measure(kart, track.id + '-' + name, name === 'inverted');
      await capture(track.id + '-loop-' + name);
      if (name === 'inverted') for (const [width, height] of [[390,844], [667,375]]) {
        await page.setViewportSize({ width, height }); await wait(1000);
        await measure(kart, `${track.id}-inverted-${width}x${height}`, true);
        await capture(`${track.id}-loop-inverted-${width}x${height}`);
      }
      assert.ok(snapshots > beforeSnapshots, 'snapshots continuent durant la pause de simulation');
      await page.setViewportSize({ width: 1440, height: 900 });
      targetFraction = fraction === .25 ? .5 : fraction === .5 ? .75 : fraction === .75 ? .82 : 2;
      paused = false; live.setSimulationInterval(tick, 1000 / config.simHz);
    }
    await until(() => exited && kart.elevation < .1 && !kart.airborne, track.id + ' : retour au sol après boucle', 25000);
    clearInterval(timer); intervals.delete(timer);
    assert.ok(maximumElevation > loop.height - .5); assert.equal(pauses, 4);
    evidence[track.id + '-loop-run'] = { entered, exited, maximumElevation, reached, final: { elevation: kart.elevation, loopId: kart.loopId, airborne: kart.airborne }, snapshots };
    fixtures.push(`${track.id} : seule la simulation privée est suspendue aux fractions réellement atteintes ${reached.map(value => value.fraction.toFixed(3)).join(', ')} pour les images. Les snapshots continuent et la simulation reprend après chaque image ; sortie au sol atteinte par le même pilote.`);
    record(`${track.name} : boucle franchie par commandes SDK, quatre poses réellement atteintes, projection du sommet inversé dans le cadre desktop et deux formats mobiles, sortie au sol.`);
    await leavePage(); await room.leave(true); activeRooms.splice(activeRooms.indexOf(room), 1);
  }
  assert.deepEqual(errors, []); assert.equal(treeRequests.length, 1);
  record(`Aucune erreur JavaScript, aucun asset HTTP manquant, cache GLB conservé après ${panoramasOnly ? 'les douze panoramas' : 'les deux courses'}.`);
  evidence.treeRequests = treeRequests;
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: false, automatedChecksPassed: true,
    visualReview: { status: 'pending', note: 'Inspecter les captures avant de valider : la projection ne prouve pas l’absence d’occlusion.' }, checks, errors, captures, evidence, fixtures,
    limitations: ['Un seul Chromium avec SwiftShader, aucun téléphone physique/GPU mesuré.',
      panoramasOnly ? 'Cette passe photographie les douze circuits ; aucun looping ni course n’est parcouru.'
        : 'Les boucles sont parcourues ; ces essais de cadrage ne sont pas des courses complètes ni des preuves réseau sur deux machines physiques.'] }, null, 2) + '\n');
} catch (error) {
  process.exitCode = 1; console.error(error);
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: false, failure: String(error), checks, errors, captures, evidence, fixtures }, null, 2) + '\n');
} finally {
  for (const timer of intervals) clearInterval(timer);
  for (const room of activeRooms) await room.leave(true).catch(() => {});
  await browser.close(); await gameServer.gracefullyShutdown(false);
  await rm(dataDirectory, { recursive: true, force: true });
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
}
