import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { config } from '../server/config.js';
import { TRACKS, trackPoint, trackElevation, nearestTrack } from '../shared/track.js';
import { getTrackEvent } from '../shared/track-events.js';
import type { World, Kart } from '../shared/game.js';

// All scene placement and pauses are confined to this ephemeral server. The
// jump height is reached by the normal simulation; it is never set for a photo.
const destination = resolve('docs/circuits-expanded'); await mkdir(destination, { recursive: true });
const dataDirectory = await mkdtemp(join(tmpdir(), 'lagon-circuits-browser-'));
const previousDirectory = process.env.PLAYER_DATA_DIR; process.env.PLAYER_DATA_DIR = dataDirectory;
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`; console.log('Serveur de validation privé : ' + origin);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
type Debug = { world: World | null; sessionId: string | null; kartAssets: { status: string; fallbackCount: number }; connected: boolean };
const checks: string[] = [], errors: string[] = [], fixtures: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = {};
const pages: Page[] = [];
const state = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label); await pause(30); }
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: join(destination, name + '.png') }); captures.push(name + '.png');
}
async function leave(page: Page) {
  if ((await state(page)).world) {
    await page.locator('#leave-button').click();
    await until(async () => (await state(page)).world === null, 'quitter le salon');
  }
}
function place(kart: Kart, progress: number, speed = 0) {
  const p = trackPoint(progress, kart.trackId);
  Object.assign(kart, p, { speed, turnVelocity: 0, lateralVelocity: 0, elevation: trackElevation(progress, kart.trackId),
    verticalVelocity: 0, airborne: false, stun: 0, boost: 0, finished: false, abandoned: false });
}
try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(30000); pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: Debug }).__lagonDebug, undefined, { timeout: 45000 });
    await page.locator('#name-input').fill(index ? 'Caméra circuit' : 'Pilote tremplin');
  }
  const [driver, observer] = pages as [Page, Page];
  assert.equal(await driver.locator('#track-cards [data-track]').count(), 12);
  evidence.trackIds = await driver.locator('#track-cards [data-track]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.track));
  assert.deepEqual(evidence.trackIds, TRACKS.map(track => track.id));

  for (const track of TRACKS.slice(6)) {
    await driver.locator(`#track-cards [data-track="${track.id}"]`).click();
    await pause(1600);
    const panoramaStyle = await driver.addStyleTag({ content: '.menu,.screen-wash,.topbar,.bottom-bar,.island-card,.home-circuit-picker{visibility:hidden!important}' });
    await capture(driver, track.id + '-overview'); await panoramaStyle.evaluate(node => node.remove());
    fixtures.push(`${track.id} : panorama du rendu d’accueil, panneaux HTML masqués uniquement pour la capture du décor.`);
    await driver.locator('#create-button').click();
    await until(async () => (await state(driver)).world?.phase === 'lobby', 'salon ' + track.id);
    const roomId = new URL(await driver.locator('#share-url').inputValue()).pathname.split('/').pop()!;
    const live = matchMaker.getLocalRoomById(roomId) as RaceRoom; assert.ok(live);
    await driver.locator('#events-select').selectOption('0');
    await until(() => live.world.eventLevel === 0, 'événements désactivés pour mesure du relief');
    assert.equal(live.world.trackId, track.id);
    await driver.locator('#ready-button').click(); await driver.locator('#start-button').click();
    await until(() => live.world.phase === 'racing', 'départ réel');
    await observer.locator('#code-input').fill(roomId); await observer.locator('#join-button').click();
    await until(async () => (await state(observer)).world?.phase === 'racing', 'observateur connecté');
    const driverId = (await state(driver)).sessionId!;
    const kart = live.world.players.find(kart => kart.id === driverId)!;
    assert.equal(live.world.players.filter(kart => kart.spectator).length, 1);
    const bridge = track.elevations.find(feature => feature.kind === 'bridge')!;
    const jump = track.elevations.find(feature => feature.kind === 'jump')!;
    place(kart, (bridge.start + bridge.end) / 2); live.world.raceTime = Math.max(2, live.world.raceTime);
    fixtures.push(`${track.id} : position initiale imposée au milieu du pont et avant le tremplin, sur le serveur privé ; aucune course complète parcourue.`);
    await until(async () => Math.abs((await state(observer)).world!.players.find(player => player.id === driverId)!.elevation - bridge.height) < .02, 'altitude pont reçue');
    await pause(1000); await capture(observer, track.id + '-bridge');
    assert.ok(Math.abs(kart.elevation - bridge.height) < .02);
    const bridgeHeight = kart.elevation;

    // Keep a spectator camera: it renders authoritative snapshots and cannot
    // locally predict the driver beyond the paused pose.
    place(kart, jump.end - 6, 36);
    const start = { x: kart.x, z: kart.z, elevation: kart.elevation };
    const update = (live as unknown as { update(deltaMs: number): void }).update.bind(live);
    let airborneSeen = false, pausedAtApex = false, apex: Partial<Kart> | undefined;
    let peak = kart.elevation, flightSamples = 0;
    const samples: Array<{ time: number; elevation: number; verticalVelocity: number; airborne: boolean; speed: number }> = [];
    const sample = setInterval(() => {
      samples.push({ time: live.world.raceTime, elevation: kart.elevation, verticalVelocity: kart.verticalVelocity, airborne: kart.airborne, speed: kart.speed });
      peak = Math.max(peak, kart.elevation);
      if (kart.airborne) { airborneSeen = true; flightSamples++; }
      if (!pausedAtApex && airborneSeen && kart.airborne && kart.verticalVelocity <= 2) {
        pausedAtApex = true; apex = structuredClone(kart);
        // Pause only this private room's simulation interval; snapshots keep
        // flowing on their separate interval, with the racing UI unchanged.
        live.setSimulationInterval(() => {}, 1000 / config.simHz);
      }
    }, 12);
    try {
      await driver.locator('#game').click({ position: { x: 1100, y: 550 } });
      await driver.keyboard.down('ArrowUp');
      await until(() => pausedAtApex, 'apex physique ' + track.id, 15000);
      await driver.keyboard.up('ArrowUp');
      await until(async () => {
        const current = (await state(observer)).world!.players.find(player => player.id === driverId)!;
        return current.airborne && Math.abs(current.elevation - apex!.elevation!) < .01;
      }, 'snapshot apex reçu');
      await pause(500); await capture(observer, track.id + '-jump');
      assert.ok(peak > jump.height + .5); assert.ok(flightSamples >= 3);
      fixtures.push(`${track.id} : capture du saut à une altitude réellement atteinte (${peak.toFixed(2)} m), intervalle de simulation privé suspendu à l’apex pour cadrage puis repris ; pas de changement de phase ni de HUD.`);
      // A resumed ordinary interval applies gravity and lands without altering
      // elevation, velocity, position or the landing result.
      live.setSimulationInterval(deltaMs => update(deltaMs), 1000 / config.simHz);
      await until(() => !kart.airborne && kart.elevation < .1, 'atterrissage normal ' + track.id, 15000);
      assert.equal(kart.verticalVelocity, 0);
      assert.ok(nearestTrack(kart.x, kart.z, track.id).distance < track.width / 2);
      const remote = (await state(observer)).world!.players.find(player => player.id === driverId)!;
      assert.ok(remote.elevation >= 0);
      evidence[track.id] = { theme: track.theme, length: track.length, width: track.width, bridgeHeight,
        start, peak, airborneSeen, flightSamples, apex, landing: { x: kart.x, z: kart.z, elevation: kart.elevation,
          verticalVelocity: kart.verticalVelocity, airborne: kart.airborne }, samples };
    } finally { clearInterval(sample); live.setSimulationInterval(deltaMs => update(deltaMs), 1000 / config.simHz); await driver.keyboard.up('ArrowUp'); }

    // Stage 2 is explicit scene setup, used to inspect the changed routes and
    // the openings in bridge rails without pretending two laps were driven.
    live.world.eventLevel = 3; live.world.eventStage = 2;
    for (const player of live.world.players) { player.eventLevel = 3; player.eventStage = 2; }
    const event = getTrackEvent(track.id, 2, 3);
    assert.ok(event.branches.some(branch => branch.open && branch.kind === 'shortcut'));
    const detour = event.branches.find(branch => branch.kind === 'detour')!;
    place(kart, detour.start - 10);
    await until(async () => (await state(observer)).world!.eventStage === 2, 'routes phase deux reçues');
    await pause(750); await capture(observer, track.id + '-routes-stage-2');
    fixtures.push(`${track.id} : phase événementielle deux imposée uniquement pour inspecter les routes alternatives et leurs raccords.`);
    record(`${track.name} : panorama, pont à ${bridgeHeight.toFixed(1)} m, saut réellement calculé jusqu’à ${peak.toFixed(2)} m puis atterrissage, routes de phase deux`);
    await leave(observer); await leave(driver);
  }

  // Real UI: every new circuit belongs to the random tournament pool.
  await driver.locator('#create-button').click(); await until(async () => (await state(driver)).world?.phase === 'lobby', 'salon aléatoire');
  await driver.locator('#mode-select').selectOption('tournament'); await driver.locator('#count-select').selectOption('8');
  await driver.locator('#selection-select').selectOption('random');
  assert.equal(await driver.locator('[data-pool-track]').count(), 12);
  for (const track of TRACKS.slice(0, 6)) await driver.locator(`[data-pool-track="${track.id}"]`).uncheck();
  await driver.locator('#configure-button').click();
  await until(async () => (await state(driver)).world!.tournament.selection === 'random', 'tirage aléatoire appliqué');
  const tournament = (await state(driver)).world!.tournament;
  assert.equal(tournament.schedule.length, 8);
  assert.deepEqual([...tournament.trackPool].sort(), TRACKS.slice(6).map(track => track.id).sort());
  assert.ok(tournament.schedule.every(id => tournament.trackPool.includes(id)));
  evidence.randomTournament = tournament; await capture(driver, 'random-eight-races-new-six');
  record('Douze pistes au catalogue ; tournoi aléatoire de huit manches composé uniquement des six nouvelles pistes cochées');
  assert.deepEqual(errors, []); record('Aucune erreur JavaScript ni ressource manquante pendant les douze sélections et les six tests de relief');
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ origin, checks, errors, fixtures, captures, evidence,
    scope: 'Deux contextes Chromium/SwiftShader sur le même hôte : un pilote et un spectateur. Serveur et stockage temporaires. Positions initiales et phase 2 mises en scène ; sauts et atterrissages calculés par la simulation normale. Pause privée du tick à l’apex uniquement pour capture. Ni course complète, ni deux machines physiques, ni tunnel public.' }, null, 2) + '\n');
} catch (error) {
  for (const [index, page] of pages.entries()) await page.screenshot({ path: join(destination, `failure-${index}.png`) }).catch(() => {});
  await writeFile(join(destination, 'failure.json'), JSON.stringify({ checks, errors, fixtures, captures, evidence,
    message: error instanceof Error ? error.stack : String(error), states: await Promise.all(pages.map(page => state(page).catch(() => null))) }, null, 2) + '\n');
  process.exitCode = 1; console.error(error);
} finally {
  await browser.close(); await gameServer.gracefullyShutdown(false);
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
  await rm(dataDirectory, { recursive: true, force: true });
}
