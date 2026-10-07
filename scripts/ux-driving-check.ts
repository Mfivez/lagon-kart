import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import type { Input, World } from '../shared/game.js';

// Private server/data only. All driving uses real UI/CDP/Colyseus inputs.
const destination = resolve('docs/ux-driving'); await mkdir(destination, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-ux-driving-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const server = createGameServer(resolve('dist/client')); await server.ready; await server.gameServer.listen(0, '127.0.0.1');
const address = server.httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await context.addInitScript(origin => { if (location.origin === origin && localStorage.getItem('lagon-touch-auto') === null) localStorage.setItem('lagon-touch-auto', 'false'); }, origin);
const page = await context.newPage(); page.setDefaultTimeout(30000);
const errors: string[] = [], checks: string[] = [], captures: string[] = [], evidence: Record<string, unknown> = { origin };
page.on('pageerror', error => errors.push(error.message));
type View = { renderedFrames: number; renderState: string; qualityMode: string; quality: string; pixelRatio: number; shadows: boolean; triangles: number; calls: number; sceneryDetails: { optional: number; visible: number }; tracked: { projected: number[] } | null };
type Debug = { world: World | null; sessionId: string | null; connected: boolean; view: View };
const debug = (): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function until(predicate: () => boolean | Promise<boolean>, label: string, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(label); await wait(50); }
}
const cdp = await context.newCDPSession(page);
let held: Array<{ id: number; x: number; y: number; radiusX: number; radiusY: number }> = [];
async function point(selector: string, x: number, y: number) {
  const box = await page.locator(selector).boundingBox(); assert.ok(box, selector);
  return { x: box.x + box.width * x, y: box.y + box.height * y };
}
async function down(selector: string, id: number, x = .5, y = .5) {
  held.push({ id, ...await point(selector, x, y), radiusX: 4, radiusY: 4 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: held });
}
async function move(id: number, x: number, y: number) {
  Object.assign(held.find(touch => touch.id === id)!, await point('#touch-steer', x, y));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: held });
}
async function up(id?: number) {
  const released = id === undefined ? [] : held.filter(touch => touch.id === id);
  held = id === undefined ? [] : held.filter(touch => touch.id !== id);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: released });
}
async function capture(name: string) {
  // Native viewport capture avoids Playwright's font/layout stabilization wait
  // while a continuously animated WebGL scene is running in software.
  const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  await writeFile(join(destination, name), Buffer.from(png.data, 'base64')); captures.push(name);
}
async function layout(width: number, height: number) {
  const boxes = await page.locator('#touch-controls button, #driving-help').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0).map(node => {
    const r = node.getBoundingClientRect(); return { id: node.id || (node as HTMLElement).dataset.touch, x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  for (const box of boxes) {
    assert.ok(box.w >= 44 && box.h >= 44, `${box.id}: tap target below44px`);
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${box.id}: clipped`);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `${a.id}/${b.id}: overlapping controls`);
  }
  const state = await debug(), projected = state.view.tracked?.projected; assert.ok(projected);
  const kart = { x: (projected[0]! + 1) * width / 2, y: (1 - projected[1]!) * height / 2 };
  const speed = await page.locator('.speed-card').boundingBox(); assert.ok(speed);
  assert.ok(!(kart.x + 18 > speed.x && kart.x - 18 < speed.x + speed.width && kart.y + 18 > speed.y && kart.y - 18 < speed.y + speed.height), 'speed HUD covers the rendered kart');
  evidence[`layout${width}x${height}`] = { boxes, kart, speed };
  record(`${width}×${height} : commandes≥44px sans chevauchement ; vitesse hors du kart rendu.`);
}
try {
  const html = await fetch(origin).then(response => response.text());
  evidence.assets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await page.locator('#graphics-quality').selectOption('detailed');
  await until(async () => (await debug()).view.qualityMode === 'detailed', 'Detailed mode not applied');
  const full = (await debug()).view; assert.equal(full.shadows, true); assert.equal(full.pixelRatio, 1);
  const menuBefore = full.renderedFrames; await wait(1200); const menuAfter = (await debug()).view.renderedFrames;
  assert.ok(menuAfter > menuBefore && menuAfter - menuBefore <= 20, `menu draws ${menuAfter - menuBefore} times in1.2s`);
  evidence.menuRendering = { before: menuBefore, after: menuAfter, milliseconds: 1200 };
  record('Menus : rendu plafonné à15FPS, sans prétendre mesurer une fluidité GPU.');
  await page.locator('#graphics-quality').selectOption('smooth');
  await until(async () => (await debug()).view.qualityMode === 'smooth', 'Smooth mode not applied');
  const light = (await debug()).view;
  assert.equal(light.shadows, false); assert.equal(light.pixelRatio, .8); assert.equal(light.quality, 'light');
  assert.ok(light.sceneryDetails.optional > light.sceneryDetails.visible);
  evidence.quality = { detailed: full, smooth: light };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await until(async () => (await debug()).view.qualityMode === 'smooth', 'Saved graphics mode not restored');
  assert.equal(await page.locator('#graphics-quality').inputValue(), 'smooth');
  await page.locator('#graphics-quality').selectOption('auto');
  await until(async () => (await debug()).view.qualityMode === 'auto', 'Auto not restored');
  record('Auto / Fluide / Détaillé : choix réel, ombres/résolution/décor réduits, préférence conservée au rechargement.');
  await page.locator('#name-input').fill('Essai conduite UX'); await page.locator('#practice-button').tap();
  await until(async () => (await debug()).world?.phase === 'racing', 'Practice did not start');
  const roomId = new URL(await page.locator('#share-url').inputValue()).pathname.split('/').pop()!;
  const room = matchMaker.getLocalRoomById(roomId) as RaceRoom, sessionId = (await debug()).sessionId!;
  const input = () => (room as unknown as { inputs: Map<string, { input: Input }> }).inputs.get(sessionId)!.input;
  const kart = () => room.world.players.find(kart => kart.id === sessionId)!;
  const neutral = () => input().throttle === 0 && input().steer === 0 && !input().brake && !input().drift;
  assert.match(await page.locator('#touch-auto').innerText(), /Conduite\s+manuelle/);
  await down('#touch-steer', 1, .2, .2); await down('[data-touch="drift"]', 2);
  await until(() => input().throttle === 1 && input().steer > .4 && input().drift, 'Diagonal and drift must combine');
  await up(2); await until(() => input().throttle === 1 && input().steer > .4 && !input().drift, 'Independent drift release');
  await move(1, .5, .8); await until(() => input().throttle === -1 && kart().speed < -1, 'Down must brake then reverse');
  await up(); await until(neutral, 'Manual release not neutral');
  await page.locator('#touch-auto').tap(); assert.match(await page.locator('#touch-auto').innerText(), /Accélération\s+automatique/);
  await until(() => input().throttle === 1, 'Auto not moving');
  await down('#touch-steer', 3, .5, .8); await until(() => input().brake || input().throttle === -1, 'Brake must override Auto');
  await up(); await until(() => input().throttle === 1, 'Auto must resume after releasing brake');
  record('Modes nommés : joystick2axes, diagonale+drift, frein/recul prioritaire sur automatique et relâchements indépendants.');
  await down('[data-touch="reset"]', 4); await up();
  await until(() => kart().resetCooldown > 0, 'Normal reset input'); await wait(2100);
  await layout(320, 568); await capture('race-mobile-320-after.png');
  await page.locator('#driving-help').tap(); await page.locator('#driving-help-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#driving-help-dialog').innerText(), /La course continue pendant l’aide/);
  await until(async () => (await debug()).view.renderState === 'dialog' && neutral(), 'Help must stop rendering and driving commands');
  const beforeHelp = await debug(), sequence = input().seq; await wait(900); const afterHelp = await debug();
  assert.equal(afterHelp.view.renderedFrames, beforeHelp.view.renderedFrames);
  assert.ok(afterHelp.world!.time > beforeHelp.world!.time + .3, 'snapshots keep arriving behind help');
  assert.ok(input().seq > sequence + 3, 'neutral Colyseus input cadence stays live');
  evidence.help = { frameBefore: beforeHelp.view.renderedFrames, frameAfter: afterHelp.view.renderedFrames, timeBefore: beforeHelp.world!.time, timeAfter: afterHelp.world!.time, inputSequenceBefore: sequence, inputSequenceAfter: input().seq };
  await capture('driving-help-mobile-320.png');
  await page.locator('[data-drive-mode="manual"]').tap();
  await page.locator('[data-help-close]').tap(); await page.locator('#touch-resume').waitFor({ state: 'visible' });
  await until(neutral, 'Help close must not revive controls'); await page.locator('#touch-resume').tap();
  assert.equal(await page.evaluate(() => localStorage.getItem('lagon-touch-auto')), 'false');
  record('Aide réelle : rendu3D suspendu, simulation/snapshots/entrées neutres actifs, reprise tactile volontaire et mode mémorisé.');
  await page.setViewportSize({ width: 667, height: 375 }); await page.locator('#touch-resume').waitFor({ state: 'visible' }); await page.locator('#touch-resume').tap();
  await until(async () => (await debug()).view.renderState === 'race', 'Render resumes after help');
  await layout(667, 375); await capture('race-mobile-landscape-after.png');
  await down('#touch-steer', 5, .2, .2); await down('[data-touch="drift"]', 6);
  await until(() => input().drift && input().throttle === 1, 'Held diagonal before orientation flip');
  await page.setViewportSize({ width: 320, height: 568 }); await up(); await until(neutral, 'Orientation must clear inputs');
  await page.locator('#touch-resume').waitFor({ state: 'visible' }); await page.locator('#touch-resume').tap();
  await page.keyboard.down('ArrowUp'); await until(() => input().throttle === 1, 'Keyboard forward preserved');
  await page.keyboard.up('ArrowUp'); await until(neutral, 'Keyboard release preserved');
  record('Orientation pendant multitouch neutralise les appuis ; clavier conserve accélération et relâchement.');
  await page.locator('#leave-button').tap(); await until(async () => !(await debug()).connected, 'Normal practice exit');
  assert.deepEqual(errors, []);
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), checks, errors, evidence, captures,
    baseline: '../fun-experience/baseline/race-mobile-320.png', fixtures: ['Serveur et stockage privés temporaires.', 'Préférence manuelle initiale dans localStorage. Aucune position, vitesse ou arrivée modifiée.'],
    limitations: ['Chromium tactile émulé avec SwiftShader ; aucun téléphone physique ni Safari iOS.', 'Le scénario prouve les choix de rendu et leur suspension, pas un débit de60FPS sur GPU.', 'Document caché couvert par les tests purs du planificateur ; aucune manipulation synthétique de visibilité dans ce parcours.'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, captures }));
} catch (error) {
  process.exitCode = 1;
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ passed: false, at: new Date().toISOString(), error: String(error), checks, errors, evidence, captures }, null, 2) + '\n');
  console.error(error);
} finally {
  await browser.close(); await server.gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
}
