import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { COLORS, type World } from '../shared/game.js';

const origin = process.env.BASE_URL || 'http://127.0.0.1:3102';
const sdk = new Client(origin.replace(/^http/, 'ws'));
const checks: string[] = [];
const errors: string[] = [];
const modelRequests: string[][] = [[], []];
const musicRequests: string[][] = [[], []];
const itemTypesSeen = new Set<string>();
const objectKindsSeen = new Set<string>();
let maximumItemCharges = 0;
const started = Date.now();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
async function until(check: () => boolean, label: string, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`); await sleep(40); }
}
type Driver = { room: Room; world?: World; sequence: number; epoch: number; timer?: ReturnType<typeof setInterval> };
type Debug = { world: World | null; sessionId: string; fps: number; quality: string;
  music: { running: boolean; track: string; selected: string; currentTime: number;
    activeElements: number; elementCount: number; loadCount: number; error: string | null };
  kartAssets: { status: string; modelUrl: string; loadCount: number; importedCount: number; fallbackCount: number } };
const drivers: Driver[] = [];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
function attach(room: Room) {
  const driver: Driver = { room, sequence: 0, epoch: -1 };
  room.onMessage('snapshot', (snapshot: { world: World }) => {
    driver.world = snapshot.world;
    for (const kart of snapshot.world.players) {
      if (kart.item) itemTypesSeen.add(kart.item);
      maximumItemCharges = Math.max(maximumItemCharges, kart.itemCharges ?? 0);
    }
    for (const object of snapshot.world.objects) objectKindsSeen.add(object.kind);
  });
  room.onMessage('notice', () => {});
  drivers.push(driver); return driver;
}
try {
  await mkdir('test-results', { recursive: true });
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  const first = attach(await sdk.create('race', { name: 'Démo corail', color: COLORS[0], trackId: 'lagon' }));
  for (let index = 1; index < 4; index++) attach(await sdk.joinById(first.room.roomId, { name: `Démo ${index + 1}`, color: COLORS[index] }));
  await until(() => drivers.every(driver => driver.world?.players.length === 4), 'quatre pilotes connectés');
  for (const driver of drivers) driver.room.send('ready', { ready: true });
  await until(() => first.world!.players.every(kart => kart.ready), 'prêts');
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1024, height: 768 } }), browser.newContext({ viewport: { width: 800, height: 600 } })]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const [index, page] of pages.entries()) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('.glb')) modelRequests[index].push(request.url());
      if (path.endsWith('.mp3')) musicRequests[index].push(request.url());
    });
    page.on('response', response => { if (response.url().includes('/models/') && response.status() !== 200) errors.push(`Modèle HTTP ${response.status()}`); });
    page.on('websocket', socket => {
      const url = new URL(socket.url());
      if (url.host !== new URL(origin).host || url.protocol !== (origin.startsWith('https:') ? 'wss:' : 'ws:')) errors.push('Origine WebSocket incorrecte');
    });
  }
  await Promise.all(pages.map(async page => {
    await page.goto(origin);
    await page.waitForFunction(() => (window as unknown as { __lagonDebug?: Debug }).__lagonDebug?.kartAssets.status === 'ready', undefined, { timeout: 30000 });
  }));
  first.room.send('start');
  await until(() => first.world?.phase === 'racing', 'départ');
  for (const driver of drivers) driver.timer = setInterval(() => {
    const kart = driver.world?.players.find(player => player.id === driver.room.sessionId);
    if (!kart || !driver.room.connection.isOpen) return;
    if (kart.epoch !== driver.epoch) { driver.epoch = kart.epoch; driver.sequence = Math.max(0, kart.lastSeq + 1); }
    driver.room.send('input', autopilot(kart, driver.sequence++, true));
  }, 1000 / 30);
  record('Quatre pilotes SDK conduisent par les commandes ordinaires');
  await Promise.all(pages.map(async (page, index) => {
    await page.locator('#name-input').fill(`Observateur ${index + 1}`);
    await page.locator('#code-input').fill(first.room.roomId);
    await page.locator('#join-button').click();
    await page.waitForFunction(() => {
      const state = (window as unknown as { __lagonDebug?: Debug }).__lagonDebug;
      return state?.world?.phase === 'racing' && state.kartAssets.status === 'ready';
    }, undefined, { timeout: 30000 });
  }));
  record('Deux sessions navigateur observent la course avec le GLB chargé');
  await Promise.all(pages.map(page => page.waitForFunction(() => {
    const music = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.music;
    return music.running && music.selected === 'lap1' && music.currentTime > .2;
  }, undefined, { timeout: 20000 })));
  for (const page of pages) {
    const state = await debug(page);
    assert.equal(state.world!.players.filter(kart => kart.spectator).length, 2);
    assert.equal(state.kartAssets.status, 'ready');
    assert.equal(state.kartAssets.loadCount, 1);
    assert.ok(state.kartAssets.importedCount >= 4);
    assert.equal(state.kartAssets.fallbackCount, 0);
    assert.equal(state.music.running, true, 'Musique active après le clic pour rejoindre');
    assert.equal(state.music.track, 'lagon');
  }
  record('Lap 1.mp3 réellement lu dans les deux navigateurs après interaction');
  await pages[0].locator('#volume-input').focus();
  await pages[0].keyboard.press('Home');
  await pages[0].waitForFunction(() => !(window as unknown as { __lagonDebug: Debug }).__lagonDebug.music.running);
  await pages[0].locator('#volume-input').evaluate(input => {
    (input as HTMLInputElement).value = '35'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await pages[0].waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.music.running);
  record('Volume à zéro : musique arrêtée ; reprise au volume rétabli');
  await pages[0].screenshot({ path: 'test-results/kart-demo-race.png' });
  await Promise.all(pages.map(page => page.waitForFunction(() => {
    const music = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.music;
    return music.running && music.selected === 'lap2' && music.currentTime > .2;
  }, undefined, { timeout: 60000 })));
  record('Passage réel au deuxième tour : Lap 2.mp3 lu dans les deux navigateurs');
  let nextLog = 0;
  await until(() => {
    if (Date.now() > nextLog) {
      nextLog = Date.now() + 15000;
      console.log(first.world!.players.filter(kart => !kart.spectator).map(kart => `${kart.name}: ${kart.lap}/3`).join(' · '));
    }
    return drivers.every(driver => driver.world?.phase === 'finished');
  }, 'course complète de trois tours', 160000);
  for (const driver of drivers) clearInterval(driver.timer);
  assert.ok(first.world!.players.filter(kart => !kart.spectator).every(kart => kart.finished && kart.lap === 3));
  await Promise.all(pages.map(page => page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.phase === 'finished')));
  const results = first.world!.players.filter(kart => !kart.spectator).map(kart => [kart.id, kart.rank, kart.lap, kart.finished]);
  await Promise.all(pages.map(page => page.waitForFunction(() => {
    const music = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.music;
    return !music.running && music.activeElements === 0;
  })));
  const browserStates = await Promise.all(pages.map(debug));
  for (const state of browserStates) assert.deepEqual(state.world!.players.filter(kart => !kart.spectator).map(kart => [kart.id, kart.rank, kart.lap, kart.finished]), results);
  record('Les quatre pilotes terminent trois tours ; les deux navigateurs affichent les mêmes résultats');
  for (const requests of modelRequests) {
    assert.equal(requests.length, 1, 'Un seul chargement GLB par page malgré plusieurs karts');
    assert.equal(new URL(requests[0]).origin, new URL(origin).origin);
  }
  for (const [index, state] of browserStates.entries()) {
    assert.equal(state.music.selected, 'lap2');
    assert.equal(state.music.elementCount, 2);
    assert.equal(state.music.loadCount, 2);
    assert.equal(state.music.error, null);
    const paths = new Set(musicRequests[index].map(url => new URL(url).pathname));
    assert.deepEqual([...paths].sort(), ['/audio/lap-1-v1.mp3', '/audio/lap-2-v1.mp3']);
    assert.ok(musicRequests[index].every(url => new URL(url).origin === new URL(origin).origin));
  }
  record('Deux lecteurs MP3 réutilisés par page, fichiers sur la même origine et lecture arrêtée à la fin');
  assert.deepEqual(errors, []);
  record('GLB chargé une seule fois par page depuis la même origine, aucune erreur JavaScript');
  await pages[0].screenshot({ path: 'test-results/kart-demo-results.png' });
  const creditResponse = await fetch(`${origin}/credits.html`);
  assert.equal(creditResponse.status, 200);
  const credit = await creditResponse.text();
  assert.ok(credit.includes('https://www.patreon.com/Zsky') && credit.includes('https://creativecommons.org/licenses/by/3.0/'));
  record('Crédits auteur et licence servis avec le jeu');
  await writeFile(process.env.REPORT_PATH || 'test-results/kart-demo.json', JSON.stringify({ origin, checks, errors,
    durationSeconds: (Date.now() - started) / 1000, drivers: 4, browserObservers: 2,
    inputMethod: 'SDK autopilot through ordinary inputs; browsers are independent spectators, not keyboard drivers',
    renderer: 'Chromium headless / SwiftShader', modelRequests, musicRequests, results,
    itemTypesSeen: [...itemTypesSeen].sort(), objectKindsSeen: [...objectKindsSeen].sort(), maximumItemCharges,
    browserDiagnostics: browserStates.map(state => ({ kartAssets: state.kartAssets, music: state.music, fps: state.fps, quality: state.quality })) }, null, 2));
  await Promise.all(pages.map(page => page.locator('#leave-button').click()));
} finally {
  for (const driver of drivers) { clearInterval(driver.timer); if (driver.room.connection.isOpen) await driver.room.leave(); }
  await browser.close();
}
