import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import type { Input, World } from '../shared/game.js';

// Default: private ephemeral server and player data. BASE_URL runs a lighter,
// explicitly separate smoke test: no access to server inputs or item fixture.
const externalOrigin = process.env.BASE_URL?.replace(/\/$/, '');
const destination = resolve(process.env.REPORT_DIR ?? (externalOrigin ? 'docs/mobile-stick/public' : 'docs/mobile-stick'));
await mkdir(destination, { recursive: true });
const directory = externalOrigin ? undefined : await mkdtemp(join(tmpdir(), 'lagon-mobile-stick-'));
if (directory) {
  process.env.PLAYER_DATA_DIR = join(directory, 'players');
  process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
}
const server = externalOrigin ? undefined : createGameServer(resolve('dist/client'));
if (server) { await server.ready; await server.gameServer.listen(0, '127.0.0.1'); }
const address = server?.httpServer.address();
assert.ok(externalOrigin || (address && typeof address !== 'string'));
const origin = externalOrigin ?? `http://127.0.0.1:${(address as { port: number }).port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
// Start stationary for reproducible input tests; the preference is later
// switched with the actual AUTO button, including its persistence check.
await context.addInitScript(() => {
  if (!localStorage.getItem('lagon-touch-auto')) localStorage.setItem('lagon-touch-auto', 'false');
});
const page = await context.newPage(); page.setDefaultTimeout(30000);
const errors: string[] = [], checks: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = { origin, mode: externalOrigin ? 'external-smoke' : 'private-input-validation' };
let lastServerInput: (() => Input) | undefined;
page.on('pageerror', error => errors.push(error.message));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Debug = { world: World | null; sessionId: string | null; connected: boolean };
const debug = (): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function until(predicate: () => boolean | Promise<boolean>, label: string, milliseconds = 25000) {
  const deadline = Date.now() + milliseconds;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(label); await wait(40); }
}
const cdp = await context.newCDPSession(page);
type Touch = { id: number; x: number; y: number; radiusX: number; radiusY: number };
let held: Touch[] = [];
async function position(selector: string, x: number, y: number) {
  const box = await page.locator(selector).boundingBox(); assert.ok(box, `Missing control: ${selector}`);
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}
async function down(selector: string, id: number, x = .5, y = .5) {
  const point = await position(selector, x, y);
  held.push({ id, ...point, radiusX: 4, radiusY: 4 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: held });
}
async function move(id: number, x: number, y: number) {
  const point = held.find(point => point.id === id); assert.ok(point);
  Object.assign(point, await position('#touch-steer', x, y));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: held });
}
async function up(id?: number) {
  // CDP's partial touchEnd takes the released point, not the remaining one.
  const released = id === undefined ? [] : held.filter(point => point.id === id);
  held = id === undefined ? [] : held.filter(point => point.id !== id);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: released });
}
async function auto(enabled: boolean) {
  const button = page.locator('#touch-auto');
  if ((await button.getAttribute('aria-pressed') === 'true') !== enabled) await button.tap();
  assert.equal(await page.evaluate(() => localStorage.getItem('lagon-touch-auto')), String(enabled));
}
async function resume() { if (await page.locator('#touch-resume').isVisible()) await page.locator('#touch-resume').tap(); }
async function knob() {
  return page.locator('#touch-steer').evaluate(node => ({ x: parseFloat((node as HTMLElement).style.getPropertyValue('--thumb-x')) || 0, y: parseFloat((node as HTMLElement).style.getPropertyValue('--thumb-y')) || 0 }));
}
async function layout(width: number, height: number) {
  const boxes = await page.locator('#touch-controls button').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).display !== 'none').map(node => {
    const r = node.getBoundingClientRect(); return { id: node.id || (node as HTMLElement).dataset.touch, x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${width}×${height}: ${box.id} clipped`);
    assert.ok(box.w >= 44 && box.h >= 44, `${width}×${height}: ${box.id} smaller than 44px`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `Overlapping controls: ${a.id}/${b.id}`);
  }
  assert.equal(await page.locator('#menu').isVisible(), false);
  evidence[`layout${width}x${height}`] = boxes;
  record(`${width}×${height} : commandes ≥44 px, dans l’écran, sans chevauchement.`);
}
async function capture(name: string) { await page.screenshot({ path: join(destination, name) }); captures.push(name); }
try {
  const html = await fetch(origin).then(response => { assert.equal(response.status, 200); return response.text(); });
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await page.locator('#name-input').fill('Test joystick mobile');
  await page.locator('#practice-button').tap();
  await until(async () => (await debug()).world?.phase === 'racing', 'Entraînement non démarré');
  let roomId = new URL(await page.locator('#share-url').inputValue()).pathname.split('/').pop()!;
  let room = server ? matchMaker.getLocalRoomById(roomId) as RaceRoom : undefined;
  let sessionId = (await debug()).sessionId!;
  const input = () => (room as unknown as { inputs: Map<string, { input: Input }> }).inputs.get(sessionId)!.input;
  if (room) lastServerInput = input;
  let kart = room?.world.players.find(kart => kart.id === sessionId);
  const noteInput = (label: string) => { assert.ok(room); evidence[label] = { ...input(), speed: kart!.speed }; };
  const neutral = () => input().throttle === 0 && !input().brake && input().steer === 0 && !input().drift;
  for (const [width, height] of [[320, 568], [667, 375]]) {
    if (width !== 320) {
      // Real steering can put the first kart against a wall while a screenshot
      // is captured. Start a fresh practice through the UI for the next size;
      // this isolates controls from position without moving the kart by fixture.
      await page.locator('#leave-button').tap();
      await until(async () => !(await debug()).connected, 'Sortie de la première taille');
      await page.locator('#practice-button').tap();
      await until(async () => (await debug()).world?.phase === 'racing', 'Nouvel entraînement pour paysage');
      roomId = new URL(await page.locator('#share-url').inputValue()).pathname.split('/').pop()!;
      room = server ? matchMaker.getLocalRoomById(roomId) as RaceRoom : undefined;
      sessionId = (await debug()).sessionId!;
      kart = room?.world.players.find(kart => kart.id === sessionId);
    }
    await page.setViewportSize({ width, height }); await wait(350); await resume(); await auto(false);
    await layout(width, height);
    const label = `${width}x${height}`;
    if (room) await until(neutral, `${label}: neutralité manuelle initiale`);
    await down('#touch-steer', 1, .5, .2);
    if (room) {
      await until(() => input().throttle === 1 && input().steer === 0 && kart!.speed > 2, `${label}: haut doit accélérer`);
      noteInput(`${label}Up`);
    } else {
      await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.speed ?? 0) > 2; }, `${label}: déplacement réel vers l’avant`);
    }
    assert.ok((await knob()).y < 0, 'Le pouce monte visuellement');
    await move(1, .5, .8);
    if (room) {
      await until(() => input().brake || input().throttle === -1, `${label}: bas doit freiner`);
      noteInput(`${label}Down`);
      await until(() => input().throttle === -1 && kart!.speed < -1, `${label}: maintenir bas doit reculer`);
      noteInput(`${label}Reverse`);
    } else {
      await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.speed ?? 0) < -1; }, `${label}: recul réel au stick`);
    }
    assert.ok((await knob()).y > 0, 'Le pouce descend visuellement');
    await move(1, .2, .2);
    if (room) await until(() => input().steer > .4 && input().throttle === 1, `${label}: diagonale haut-gauche`);
    const upperLeft = await knob(); assert.ok(upperLeft.x < 0 && upperLeft.y < 0);
    await capture(`stick-${label}.png`);
    await move(1, .8, .8);
    if (room) await until(() => input().steer < -.4 && (input().brake || input().throttle === -1), `${label}: diagonale bas-droite`);
    const lowerRight = await knob(); assert.ok(lowerRight.x > 0 && lowerRight.y > 0);
    await up(); if (room) await until(neutral, `${label}: relâchement manuel`);
    assert.deepEqual(await knob(), { x: 0, y: 0 });
    record(`${width}×${height} : haut accélère, bas freine puis recule ; diagonales et retour du pouce au centre au relâchement.`);
    if (!room) {
      // External smoke checks physical speed, so use the normal REPLACER
      // control after the diagonal screenshot before measuring AUTO anew.
      await down('[data-touch="reset"]', 20); await up();
      await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.resetCooldown ?? 0) > 0; }, `${label}: replacer via commande normale`);
    }
    await auto(true);
    if (room) await until(() => input().throttle === 1, `${label}: AUTO ON`);
    else await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.speed ?? 0) > 2; }, `${label}: AUTO fait avancer`);
    await down('#touch-steer', 2, .2, .5);
    if (room) await until(() => input().steer > .4 && input().throttle === 1, `${label}: AUTO et direction horizontale`);
    await move(2, .2, .8);
    if (room) { await until(() => input().steer > .4 && (input().brake || input().throttle === -1), `${label}: bas prioritaire AUTO`); noteInput(`${label}AutoDown`); }
    else await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.speed ?? 0) < -1; }, `${label}: bas interrompt AUTO et fait reculer`);
    await up();
    if (room) await until(() => input().steer === 0 && input().throttle === 1, `${label}: reprise AUTO au relâchement`);
    else await until(async () => { const state = await debug(); return (state.world?.players.find(kart => kart.id === state.sessionId)?.speed ?? 0) > 2; }, `${label}: AUTO reprend après relâchement`);
    await auto(false);
    record(`${width}×${height} : AUTO commutable et mémorisé ; descendre le stick interrompt les gaz${room ? ', relâcher réactive AUTO' : ' et permet le recul'}.`);
  }
  if (room && kart) {
    await down('#touch-steer', 3, .2, .2); await down('[data-touch="drift"]', 4);
    await until(() => input().steer > .4 && input().throttle === 1 && input().drift, 'Stick diagonal + drift multitouch');
    noteInput('stickAndDrift');
    await up(4); await until(() => input().steer > .4 && input().throttle === 1 && !input().drift, 'Lever drift garde le stick');
    // Sole gameplay fixture: grant one item on the private server, then use it
    // exclusively through the normal browser/CDP and authoritative input path.
    kart.item = 'tripleTurbo'; kart.itemCharges = 3;
    await down('[data-touch="item"]', 5);
    await until(() => kart.itemCharges === 2, 'Objet via geste multitouch');
    await wait(450); assert.equal(kart.itemCharges, 2); assert.ok(input().steer > .4 && input().throttle === 1);
    await up(5); await up();
    record('Vrai multitouch : stick diagonal + drift/objet ; relâchements indépendants, une seule charge consommée par pression.');
    await down('[data-touch="accelerate"]', 6); await down('#touch-steer', 7, .5, .8);
    await until(() => input().brake || input().throttle === -1, 'Bas prioritaire sur pédale accélérateur');
    await up(7); await until(() => input().throttle === 1, 'Pédale toujours tenue après relâchement stick');
    await up(); await until(neutral, 'Pédale relâchée');
    await down('#touch-steer', 8, .8, .2); await down('[data-touch="brake"]', 9);
    await until(() => input().steer < -.4 && (input().brake || input().throttle === -1), 'Pédale frein prioritaire sur haut du stick');
    await up(); await until(neutral, 'Stick et pédale frein relâchés');
    record('Pédales conservées : frein/recul prioritaire sur tout accélérateur, commandes indépendantes au relâchement.');
  }
  await auto(true); await down('#touch-steer', 10, .2, .2); await down('[data-touch="drift"]', 11);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); held = [];
  if (room) await until(neutral, 'touchCancel doit neutraliser même AUTO ON');
  await page.locator('#touch-resume').waitFor({ state: 'visible' }); assert.deepEqual(await knob(), { x: 0, y: 0 });
  record(`Annulation tactile CDP : pouce centré et reprise volontaire visible${room ? ' ; gaz AUTO et drift suspendus' : ''}.`);
  await resume(); await down('#touch-steer', 12, .8, .2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await up();
  if (room) await until(neutral, 'Perte focus doit neutraliser');
  await page.locator('#touch-resume').waitFor({ state: 'visible' }); assert.deepEqual(await knob(), { x: 0, y: 0 });
  record(`Perte de focus simulée : ${room ? 'commandes relâchées et AUTO suspendu' : 'pouce centré et reprise volontaire visible'}.`);
  await resume(); await down('#touch-steer', 13, .2, .8);
  await page.setViewportSize({ width: 320, height: 568 }); await up();
  if (room) await until(neutral, 'Changement orientation doit neutraliser');
  await page.locator('#touch-resume').waitFor({ state: 'visible' }); assert.deepEqual(await knob(), { x: 0, y: 0 });
  record(`Passage paysage → portrait pendant le geste : ${room ? 'aucun axe ni gaz conservé' : 'pouce centré et reprise volontaire visible'}.`);
  await resume(); await auto(false);
  if (room) {
    await page.keyboard.down('ArrowUp'); await until(() => input().throttle === 1, 'Clavier conservé');
    await page.keyboard.up('ArrowUp'); await until(neutral, 'Clavier relâché');
    record('Clavier : accélération et relâchement restent indépendants du tactile.');
  }
  await capture('stick-320x568-neutral.png');
  await page.locator('#leave-button').tap();
  await until(async () => !(await debug()).connected, 'Sortie normale entraînement');
  assert.deepEqual(errors, []);
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: true, timestamp: new Date().toISOString(), checks, errors, captures, evidence,
    fixtures: externalOrigin ? ['Préférence AUTO OFF initiale via localStorage ; gestes CDP Chromium normaux ; événement blur synthétique. Aucun état de jeu modifié.'] : ['Serveur et données privés éphémères ; préférence AUTO OFF initiale via localStorage ; entraînement lancé par UI ; gestes CDP Chromium ; événement blur synthétique.', 'Un triple turbo attribué au kart privé pour mesurer une consommation par appui. Toutes les accélérations, directions et vitesses sont produites par les contrôles normaux ; aucune mutation de trajectoire ni suspension de simulation.'],
    limitations: ['Chromium/SwiftShader émulé : téléphone physique et Safari iOS non testés.', ...(externalOrigin ? ['Smoke externe : commandes et déplacement observés, sans inspection des entrées serveur ni test de consommation d’objet.'] : [])] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, captures }, null, 2));
} catch (error) {
  process.exitCode = 1;
  if (lastServerInput) { try { evidence.lastServerInput = { ...lastServerInput() }; } catch { /* Room may already be disposed. */ } }
  try { const state = await debug(); evidence.lastKart = state.world?.players.find(kart => kart.id === state.sessionId); } catch { /* Browser may already be closed. */ }
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: false, timestamp: new Date().toISOString(), error: String(error), checks, errors, captures, evidence }, null, 2) + '\n');
  console.error(error);
} finally {
  // Also close the room normally after a failed external smoke, so the public
  // server does not retain this browser's reconnection seat until its timeout.
  try { if ((await debug()).connected) await page.locator('#leave-button').tap({ timeout: 4000 }); } catch { /* Browser can already be closed on a transport failure. */ }
  await browser.close();
  if (server) await server.gameServer.gracefullyShutdown(false);
  if (directory) await rm(directory, { recursive: true, force: true });
}
