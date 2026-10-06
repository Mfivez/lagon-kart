import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { autopilot } from '../shared/autopilot.js';
import type { Kart, World } from '../shared/game.js';

type Debug = { world: World | null; sessionId: string; predicted: Kart | null; fps: number; connected: boolean };
const origin = process.env.BASE_URL || 'http://127.0.0.1:3000';
const checks: string[] = [];
const errors: string[] = [];
const assets = new Set<string>();
const sockets = new Set<string>();
const metrics: number[][] = [[], []];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
function record(value: string) { checks.push(value); console.log(`✓ ${value}`); }
async function phase(page: Page, value: string) {
  await page.waitForFunction(expected => (window as unknown as { __lagonDebug?: Debug }).__lagonDebug?.world?.phase === expected, value, { timeout: 15000 });
}
async function drive(page: Page) {
  const state = await debug(page);
  const me = state.predicted ?? state.world?.players.find(p => p.id === state.sessionId);
  if (!me) return;
  const command = autopilot(me, 0, true);
  const desired = !me.finished && state.world?.phase === 'racing'
    ? [...(command.throttle > 0 ? ['ArrowUp'] : []), ...(command.brake ? ['ArrowDown'] : []),
      ...(command.steer > 0.12 ? ['ArrowLeft'] : command.steer < -0.12 ? ['ArrowRight'] : []),
      ...(command.use ? ['KeyE'] : []), ...(command.reset ? ['KeyR'] : [])]
    : [];
  // Standard DOM keyboard events pass through the exact player control handlers.
  // The diagnostic API is read-only; no positions or game rules are changed.
  await page.evaluate(wanted => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'KeyE', 'KeyR']) {
      document.body.dispatchEvent(new KeyboardEvent(wanted.includes(code) ? 'keydown' : 'keyup', { code, bubbles: true }));
    }
  }, desired);
}

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
try {
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 900 } }), browser.newContext({ viewport: { width: 1280, height: 800 } })]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of pages) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().includes('/assets/')) { assets.add(response.url()); if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); } });
    page.on('websocket', socket => sockets.add(socket.url()));
  }
  await pages[0].goto(origin);
  await pages[0].locator('#create-button').waitFor();
  await pages[0].screenshot({ path: 'test-results/home.png' });
  await pages[0].getByLabel('Pseudo', { exact: true }).fill('Camille');
  await pages[0].locator('#create-button').click();
  await phase(pages[0], 'lobby');
  const link = await pages[0].locator('#share-url').inputValue();
  assert.ok(link.startsWith(origin));
  await pages[1].goto(link);
  await pages[1].getByLabel('Pseudo', { exact: true }).fill('Sacha');
  await pages[1].locator('[data-color]').nth(2).click();
  await pages[1].locator('#join-button').click();
  await phase(pages[1], 'lobby');
  await pages[0].waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.players.length === 2);
  record('Deux contextes navigateur indépendants créent et rejoignent par lien');
  await pages[0].screenshot({ path: 'test-results/lobby.png' });
  await pages[1].locator('#ready-button').click();
  await pages[0].locator('#ready-button').click();
  await pages[0].locator('#start-button').click();
  await Promise.all(pages.map(page => phase(page, 'racing')));
  record('Décompte synchronisé et course lancée depuis les boutons');
  await Promise.all(pages.map(page => page.keyboard.down('ArrowUp')));
  await sleep(1300);
  await Promise.all(pages.map(page => page.keyboard.up('ArrowUp')));
  const beforeRefresh = await debug(pages[1]);
  assert.ok(beforeRefresh.world!.players.some(p => p.speed > 1));
  const observer = await debug(pages[0]);
  assert.ok(observer.world!.players.find(p => p.id === beforeRefresh.sessionId)!.speed > 1);
  record('Accélération au clavier visible chez les deux pilotes');
  const oldStorage = await pages[1].evaluate(() => sessionStorage.getItem('lagon-session'));
  await pages[1].reload();
  await phase(pages[1], 'racing');
  const afterRefresh = await debug(pages[1]);
  assert.equal(afterRefresh.sessionId, beforeRefresh.sessionId);
  assert.equal(afterRefresh.world!.players.length, 2);
  assert.notEqual(await pages[1].evaluate(() => sessionStorage.getItem('lagon-session')), oldStorage);
  record('Actualisation du lien direct : même session, pas de doublon, jeton renouvelé');
  await pages[0].keyboard.down('ArrowUp');
  await pages[0].evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(1100);
  const blurred = await debug(pages[0]);
  assert.ok(Math.abs(blurred.world!.players.find(p => p.id === blurred.sessionId)!.speed) < 8);
  await pages[0].keyboard.up('ArrowUp');
  record('Perte de focus : accélérateur relâché');
  const deadline = Date.now() + 180000;
  let captured = false;
  let nextLog = Date.now() + 15000;
  while (true) {
    const states = await Promise.all(pages.map(debug));
    states.forEach((state, i) => metrics[i].push(state.fps));
    if (states.every(state => state.world?.phase === 'finished')) break;
    if (Date.now() > deadline) throw new Error('Les navigateurs ne terminent pas la course dans le délai.');
    await Promise.all(pages.map(drive));
    if (!captured && states[0].world!.raceTime > 8) { await pages[0].screenshot({ path: 'test-results/race.png' }); captured = true; }
    if (Date.now() > nextLog) { console.log('Navigateurs', states[0].world!.players.map(p => ({ name: p.name, lap: p.lap, progress: Math.round(p.progress) }))); nextLog = Date.now() + 15000; }
    await sleep(40);
  }
  const final = await Promise.all(pages.map(debug));
  const result = (state: Debug) => state.world!.players.map(p => [p.id, p.rank, p.finished, p.lap]);
  assert.deepEqual(result(final[0]), result(final[1]));
  assert.ok(final[0].world!.players.every(p => p.finished && p.lap === 3));
  await pages[0].screenshot({ path: 'test-results/results.png' });
  record('Trois tours via commandes clavier, résultats identiques dans les deux navigateurs');
  const host = pages[final[0].sessionId === final[0].world!.hostId ? 0 : 1];
  await host.locator('#rematch-button').click();
  await Promise.all(pages.map(page => phase(page, 'lobby')));
  assert.ok((await debug(host)).world!.players.every(p => !p.ready && p.lap === 0));
  record('Bouton revanche : nouveau salon prêt à repartir');
  for (const url of assets) assert.equal(new URL(url).origin, new URL(origin).origin);
  for (const url of sockets) assert.equal(new URL(url).protocol, origin.startsWith('https:') ? 'wss:' : 'ws:');
  assert.ok(assets.size > 0 && sockets.size >= 2);
  assert.deepEqual(errors, []);
  record('Assets et WebSockets sur la même origine, aucune erreur JavaScript');
  const report = { origin, checks, errors, assets: [...assets], sockets: [...sockets], renderer: 'Chromium headless / SwiftShader (software)',
    fps: metrics.map(samples => ({ median: [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)], min: Math.min(...samples), max: Math.max(...samples) })), results: result(final[0]) };
  await writeFile(process.env.REPORT_PATH || 'test-results/browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await Promise.all(pages.map(page => page.locator('#leave-button').click()));
} finally { await browser.close(); }
