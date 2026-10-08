import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { matchMaker } from '@colyseus/core';
import type { RaceRoom } from '../server/RaceRoom.js';
import type { Input, Kart, World } from '../shared/game.js';
import type { StoredCustomTrack } from '../shared/custom-tracks.js';
import { homeControl } from './menu-navigation.js';

// The baseline intentionally uses the previous complete compiled build for
// BOTH server and browser; source files can be edited while it is running.
const baseline = process.argv.includes('--baseline');
const root = baseline ? '../dist/' : '../';
const { createGameServer } = await import(root + 'server/app.js') as typeof import('../server/app.js');
const { getTrack, nearestTrack, trackPoint } = await import(root + 'shared/track.js') as typeof import('../shared/track.js');
const { kartLoopPose, trackLoopPose } = await import(root + 'shared/track-loop.js') as typeof import('../shared/track-loop.js');
const { autopilot } = await import(root + 'shared/autopilot.js') as typeof import('../shared/autopilot.js');
const { CUSTOM_TRACK_TEMPLATES } = await import(root + 'shared/custom-tracks.js') as typeof import('../shared/custom-tracks.js');
const destination = resolve(process.env.REPORT_DIR ?? `docs/loop-driving/${baseline ? 'before' : 'after'}`);
await mkdir(destination, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-loop-driving-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const server = createGameServer(resolve('dist/client'));
await server.ready; await server.gameServer.listen(0, '127.0.0.1');
const address = server.httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const errors: string[] = [], cases: unknown[] = [], captures: unknown[] = [], fixtures: string[] = [];
const peers: Array<{ room: Room; world?: World; seq: number; epoch: number; snapshots: number }> = [];
const timers = new Set<ReturnType<typeof setInterval>>();
let browser: Browser | undefined, failure: string | undefined;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>, label: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(label); await wait(35); }
}
function attach(room: Room) {
  const peer = { room, seq: 0, epoch: -1, snapshots: 0, world: undefined as World | undefined }; peers.push(peer);
  room.onMessage('snapshot', ({ world, tracks }: { world: World; tracks?: StoredCustomTrack[] }) => {
    peer.world = world; peer.snapshots++;
    if (tracks?.length) room.send('tracksReady', { ids: tracks.map(track => track.runtimeId ?? `${track.id}-v${track.revision}`) });
  });
  room.onMessage('notice', () => {}); room.onError((code, message) => errors.push(`${code}: ${message}`)); return peer;
}
function send(peer: typeof peers[number], value: Partial<Input>) {
  const kart = peer.world?.players.find(kart => kart.id === peer.room.sessionId); if (!kart) return;
  if (kart.epoch !== peer.epoch) { peer.epoch = kart.epoch; peer.seq = Math.max(0, kart.lastSeq + 1); }
  peer.room.send('input', { seq: peer.seq++, epoch: kart.epoch, throttle: 1, steer: 0, brake: false, drift: false, use: false, reset: false, ...value });
}
async function race(trackId: string) {
  const host = attach(await new Client(origin.replace(/^http/, 'ws')).create('race', { trackId, name: 'Essai looping' }));
  const observer = attach(await new Client(origin.replace(/^http/, 'ws')).joinById(host.room.roomId, { name: 'Témoin réseau' }));
  const live = matchMaker.getLocalRoomById(host.room.roomId) as RaceRoom;
  await until(() => live.world.players.length === 2, 'Deux pilotes dans le salon');
  host.room.send('configure', { eventLevel: 0 });
  for (const peer of [host, observer]) peer.room.send('ready', { ready: true });
  await until(() => live.world.players.every(kart => kart.ready) && live.world.eventLevel === 0, 'Pilotes prêts');
  host.room.send('start'); await until(() => live.world.phase === 'racing', 'Départ normal');
  return { host, observer, live, kart: live.world.players.find(kart => kart.id === host.room.sessionId)! };
}
function fixture(kart: Kart) {
  const track = getTrack(kart.trackId), progress = track.loops[0]!.start - 3;
  Object.assign(kart, trackPoint(progress, track.id), { speed: 0, turnVelocity: 0, lateralVelocity: 0, routeProgress: progress });
  assert.equal(kart.elevation, 0); assert.equal(kart.loopId, ''); assert.equal(kart.airborne, false);
}
async function closeRace(current: Awaited<ReturnType<typeof race>>) {
  for (const peer of [current.host, current.observer]) {
    if (peer.room.connection.isOpen) await peer.room.leave(true);
    peers.splice(peers.indexOf(peer), 1);
  }
}
try {
  const html = await fetch(origin).then(response => response.text());
  const clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  await writeFile(join(destination, 'build.json'), JSON.stringify({ baseline, clientAssets, date: new Date().toISOString() }, null, 2) + '\n');
  const identity = await fetch(origin + '/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Atelier privé looping' }) }).then(r => r.json()) as { token: string };
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
  draft.name = 'Atelier looping de validation'; draft.lapCount = 1; draft.zones = [];
  draft.loops = [{ start: .025, end: .13, height: 25, lateralSpread: 18 }];
  const response = await fetch(origin + '/api/tracks', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + identity.token }, body: JSON.stringify({ draft }) });
  assert.equal(response.status, 201);
  const custom = (await response.json() as { track: StoredCustomTrack }).track;
  fixtures.push('Serveur et données éphémères, aucun compte ni circuit de production modifié. Circuit atelier ovale créé par API normale avec un looping.');
  for (const trackId of baseline ? ['sky'] : ['sky', 'foundry', custom.runtimeId!]) {
    for (const direction of baseline ? [1] : [-1, 1]) {
      const current = await race(trackId), { host, observer, live, kart } = current;
      fixture(kart); const track = getTrack(trackId), loop = track.loops[0]!;
      const turbo = direction === -1;
      if (turbo) { kart.item = 'turbo'; kart.itemCharges = 1; }
      let entered = false, exited = false, lostAdhesion = false, maximumDistance = 0, maximumElevation = 0, used = false, boosted = false;
      const start = live.world.raceTime;
      const timer = setInterval(() => {
        const pose = kartLoopPose(kart), near = nearestTrack(kart.x, kart.z, trackId, { progress: kart.routeProgress, elevation: kart.elevation });
        if (pose.active) entered = true;
        if (entered && !exited && near.progress > loop.start + 1 && near.progress < loop.end - 1) {
          maximumDistance = Math.max(maximumDistance, near.distance); if (!kart.loopId || kart.airborne) lostAdhesion = true;
        }
        maximumElevation = Math.max(maximumElevation, kart.elevation); boosted ||= kart.boost > 0;
        exited ||= entered && !pose.active && near.progress > loop.end && near.progress < loop.end + 20 && kart.elevation < .15 && !kart.airborne;
        const use = turbo && entered && !used; used ||= use;
        send(host, { steer: entered ? direction : autopilot(kart, 0).steer, use });
      }, 1000 / 30); timers.add(timer);
      const deadline = Date.now() + (baseline ? 12000 : 25000);
      while (!exited && Date.now() < deadline) await wait(60);
      clearInterval(timer); timers.delete(timer);
      await until(() => observer.snapshots > 10 && host.snapshots > 10, 'Deux flux de snapshots actifs');
      const mirrored = observer.world!.players.find(player => player.id === kart.id)!;
      const report = { trackId, direction, turbo, entered, exited, lostAdhesion, maximumDistance, halfWidth: track.width / 2, maximumElevation, boosted,
        simulationSeconds: live.world.raceTime - start, snapshots: [host.snapshots, observer.snapshots], observerPositionError: Math.hypot(mirrored.x - kart.x, mirrored.z - kart.z),
        final: { x: kart.x, z: kart.z, progress: kart.routeProgress, elevation: kart.elevation, loopId: kart.loopId, speed: kart.speed } };
      cases.push(report); console.log(JSON.stringify(report));
      if (!baseline) { assert.ok(entered && exited, `${trackId}: plein braquage ${direction} doit franchir le looping`); assert.equal(lostAdhesion, false); assert.ok(maximumDistance <= track.width / 2 + 5 - 1.25 + .02, 'Carrosserie contenue entre les rails avec accotement'); if (turbo) assert.ok(boosted); }
      await closeRace(current);
    }
  }
  fixtures.push('Chaque essai réseau utilise deux SDK Colyseus dans une course ordinaire. Seul le kart pilote est posé au sol, arrêté, 3 m avant le looping ; ensuite commandes input normales. Un turbo attribué avant chaque essai gauche puis consommé par input.use. Pas de téléportation, reset ou suspension durant ces parcours.');

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(() => { localStorage.setItem('lagon-volume', '0'); localStorage.setItem('lagon-graphics-quality', 'smooth'); localStorage.setItem('lagon-touch-auto', 'false'); });
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && /\.(?:js|css|glb|mp3)(?:\?|$)/.test(response.url())) errors.push(`Asset HTTP ${response.status()}: ${response.url()}`); });
  page.on('request', request => { if (/\.(?:glb|mp3)(?:\?|$)/.test(request.url()) && new URL(request.url()).origin !== origin) errors.push('Asset hors origine: ' + request.url()); });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  const cdp = await context.newCDPSession(page);
  for (const trackId of baseline ? ['sky'] : ['sky', 'foundry', custom.runtimeId!]) {
    const current = await race(trackId), { live, host, kart } = current;
    await (await homeControl(page, '#code-input')).fill(host.room.roomId);
    await (await homeControl(page, '#join-button')).click();
    await until(() => live.world.players.some(kart => kart.spectator), 'Observateur navigateur');
    fixture(kart); let target = .25, paused = false;
    const originalUpdate = (live as unknown as { update(deltaMs: number): void }).update.bind(live);
    const tick = (deltaMs: number) => { originalUpdate(deltaMs); const pose = kartLoopPose(kart); if (!paused && pose.active && pose.fraction >= target) { paused = true; live.setSimulationInterval(() => {}, 1000 / 30); } };
    live.setSimulationInterval(tick, 1000 / 30);
    const timer = setInterval(() => send(host, { ...autopilot(kart, host.seq), reset: false }), 1000 / 30); timers.add(timer);
    for (const [fraction, name] of [[.25, 'entry'], [.5, 'apex'], [.75, 'exit']] as const) {
      await until(() => paused, `${trackId}: capture ${name}`, 30000);
      for (const viewport of name === 'apex' ? [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 667, height: 375 }] : [{ width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport); await wait(700);
        const state = await page.evaluate(() => {
          const debug = (window as unknown as { __lagonDebug: { view: unknown; world: World; sessionId: string } }).__lagonDebug;
          return { view: debug.view, world: debug.world, sessionId: debug.sessionId };
        });
        const label = `${trackId.startsWith('custom-') ? 'workshop' : trackId}-${name}-${viewport.width}x${viewport.height}`;
        const frame = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false });
        await writeFile(join(destination, label + '.png'), Buffer.from(frame.data, 'base64'));
        const pose = kartLoopPose(kart), view = state.view as { tracked: { id: string; position: number[]; projected: number[]; up: number[] }; camera: { position: number[]; target: number[]; up?: number[] } };
        assert.equal(state.world.practice, false); assert.equal(view.tracked.id, kart.id);
        const renderedError = Math.hypot(view.tracked.position[0]! - pose.x, view.tracked.position[1]! - pose.y, view.tracked.position[2]! - pose.z);
        assert.ok(renderedError < .25, 'Rendu conforme à la pose autoritaire');
        const roadFrame = trackLoopPose(kart.routeProgress ?? kart.progress, trackId);
        const offset = view.camera.position.map((value, i) => value - [pose.x, pose.y, pose.z][i]!);
        const aim = view.camera.target.map((value, i) => value - [pose.x, pose.y, pose.z][i]!);
        const cameraAcross = offset[0]! * roadFrame.right.x + offset[1]! * roadFrame.right.y + offset[2]! * roadFrame.right.z;
        const cameraAbove = offset[0]! * roadFrame.up.x + offset[1]! * roadFrame.up.y + offset[2]! * roadFrame.up.z;
        const cameraAhead = aim[0]! * roadFrame.tangent.x + aim[1]! * roadFrame.tangent.y + aim[2]! * roadFrame.tangent.z;
        if (!baseline) {
          assert.ok(Math.abs(view.tracked.projected[0]!) < .95 && Math.abs(view.tracked.projected[1]!) < .95, 'Kart dans le cadre');
          assert.ok(Math.abs(cameraAcross) < .25 && cameraAbove >= 3 && cameraAhead > 1.5, 'Caméra alignée avec la piste et regard vers la suite du looping');
        }
        captures.push({ file: label + '.png', trackId, fraction: pose.fraction, elevation: kart.elevation, renderedError, cameraAcross, cameraAbove, cameraAhead, view });
        console.log('Capture ' + label);
      }
      await page.setViewportSize({ width: 1280, height: 800 });
      target = fraction === .25 ? .5 : fraction === .5 ? .75 : 2; paused = false; live.setSimulationInterval(tick, 1000 / 30);
    }
    await until(() => !kart.loopId && (kart.routeProgress ?? 0) > getTrack(trackId).loops[0]!.end && kart.elevation < .15, 'Sortie du parcours photographié');
    clearInterval(timer); timers.delete(timer);
    await page.locator('#leave-button').click(); await until(() => live.world.players.filter(kart => kart.spectator && kart.connected).length === 0, 'Sortie observateur');
    await closeRace(current);
  }
  fixtures.push('Captures : navigateur spectateur suivant le premier SDK piloté avec autopilot normal. Simulation privée suspendue aux fractions réellement atteintes 0,25/0,50/0,75 pour stabiliser les captures, puis reprise jusqu’à la sortie. Aucun temps de course complet revendiqué.');
  if (!baseline) for (const mobile of [false, true]) {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    const host = attach(await new Client(origin.replace(/^http/, 'ws')).create('race', { trackId: 'sky', name: 'Témoin commandes' }));
    const live = matchMaker.getLocalRoomById(host.room.roomId) as RaceRoom;
    await (await homeControl(page, '#code-input')).fill(host.room.roomId); await (await homeControl(page, '#join-button')).click();
    await until(() => live.world.players.length === 2, 'Pilote navigateur rejoint');
    const sessionId = await page.evaluate(() => (window as unknown as { __lagonDebug: { sessionId: string } }).__lagonDebug.sessionId);
    const kart = live.world.players.find(kart => kart.id === sessionId)!;
    host.room.send('configure', { eventLevel: 0 }); host.room.send('ready', { ready: true }); await page.locator('#ready-button').click();
    await until(() => live.world.players.every(kart => kart.ready) && live.world.eventLevel === 0, 'Prêts pour essai commandes');
    host.room.send('start'); await until(() => live.world.phase === 'racing', 'Départ essai commandes');
    await page.locator('#touch-controls').waitFor({ state: 'visible' });
    if (await page.locator('#touch-resume').isVisible()) await page.locator('#touch-resume').tap();
    fixture(kart);
    const input = () => (live as unknown as { inputs: Map<string, { input: Input }> }).inputs.get(sessionId)?.input;
    let touch: { id: number; x: number; y: number; radiusX: number; radiusY: number } | undefined;
    if (mobile) {
      const box = await page.locator('#touch-steer').boundingBox(); assert.ok(box);
      touch = { id: 1, x: box.x + box.width * .5, y: box.y + box.height * .05, radiusX: 4, radiusY: 4 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
    } else await page.keyboard.down('ArrowUp');
    await until(() => !!kart.loopId && input()?.throttle === 1, 'Entrée avec commande navigateur');
    if (mobile) {
      const box = await page.locator('#touch-steer').boundingBox(); assert.ok(box && touch);
      touch.x = box.x + box.width * .05; touch.y = box.y + box.height * .05;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch] });
    } else await page.keyboard.down('ArrowRight');
    await until(() => Math.abs(input()?.steer ?? 0) > .75, 'Braquage réellement reçu par le serveur');
    const loop = getTrack('sky').loops[0]!, deadline = Date.now() + 30000;
    let maximumDistance = 0, lostAdhesion = false, exited = false, maximumElevation = 0;
    while (!exited && Date.now() < deadline) {
      const near = nearestTrack(kart.x, kart.z, 'sky', { progress: kart.routeProgress, elevation: kart.elevation });
      if (near.progress > loop.start + 1 && near.progress < loop.end - 1) {
        maximumDistance = Math.max(maximumDistance, near.distance); lostAdhesion ||= !kart.loopId || kart.airborne;
      }
      maximumElevation = Math.max(maximumElevation, kart.elevation);
      exited = !kart.loopId && near.progress > loop.end && near.progress < loop.end + 20 && !kart.airborne && kart.elevation < .15;
      await wait(35);
    }
    const lastInput = { ...input() };
    if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else { await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp'); }
    await until(() => input()?.steer === 0 && input()?.throttle === 0, 'Relâchement commandes serveur');
    const result = { controls: mobile ? 'CDP touch joystick diagonal held' : 'ArrowUp + ArrowRight held', trackId: 'sky', practice: live.world.practice,
      exited, maximumDistance, maximumElevation, lostAdhesion, lastInput };
    cases.push(result); console.log(JSON.stringify(result));
    assert.ok(exited, 'Le navigateur doit sortir du looping'); assert.equal(lostAdhesion, false); assert.ok(maximumDistance <= getTrack('sky').width / 2 + 5 - 1.25 + .02, 'Carrosserie contenue entre les rails avec accotement');
    await page.locator('#leave-button').click(); await host.room.leave(true); peers.splice(peers.indexOf(host), 1);
  }
  if (!baseline) fixtures.push('Deux parcours supplémentaires conduits par le navigateur dans des courses ordinaires : touches ArrowUp + ArrowRight maintenues, puis joystick tactile CDP en diagonale. Même fixture au sol avant entrée, aucune suspension ensuite. Entrées, adhérence et sortie mesurées dans le serveur autoritaire.');
  assert.deepEqual(errors, []);
} catch (error) { failure = String(error); process.exitCode = 1; console.error(error); }
finally {
  for (const timer of timers) clearInterval(timer);
  await browser?.close();
  for (const peer of peers) if (peer.room.connection.isOpen) await peer.room.leave().catch(() => {});
  await server.gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: !failure, baseline, failure, cases, captures, fixtures, errors,
    limitations: ['Chromium SwiftShader, pas de téléphone physique ni Safari iOS.', 'Deux clients réseau locaux, pas deux machines physiques.', 'Fixtures de départ privées : ces parcours ciblés ne constituent pas des courses complètes.'] }, null, 2) + '\n');
}
