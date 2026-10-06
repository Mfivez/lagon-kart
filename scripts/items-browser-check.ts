import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { trackPoint, type Item, type Kart, type World, type WorldObject } from '../shared/game.js';

// This script always creates its own private server. It never accepts BASE_URL.
// Server fixtures grant items and set known positions; activations use ordinary
// keyboard controls. Real timers run normally until the final staged screenshot.
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const checks: string[] = [];
const errors: string[] = [];
const fixtures: string[] = [];
const seenObjects = new Map<string, WorldObject>();
const durations: Record<string, { first: number; remaining: number; end?: number; elapsed?: number }> = {};
const hudEvidence: Record<string, string> = {};
let observer: Room | undefined;
let observerWorld: World | undefined;
let hostId = '';
let observedEffect: 'invincible' | 'shield' | undefined;
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label); await sleep(25); }
}
type Debug = { world: World | null; sessionId: string; kartAssets: { status: string } };
const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
async function waitItem(page: Page, item: Item, charges?: number) {
  await page.waitForFunction(({ item, charges }) => {
    const state = (window as unknown as { __lagonDebug: Debug }).__lagonDebug;
    const kart = state.world?.players.find(player => player.id === state.sessionId);
    return kart?.item === item && (charges === undefined || kart.itemCharges === charges);
  }, { item, charges }, { timeout: 15000 });
}
try {
  await mkdir('test-results', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (/\/(?:assets|models)\//.test(response.url()) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(origin);
  await page.locator('#name-input').fill('Test objets');
  await page.locator('#create-button').click();
  await page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.phase === 'lobby');
  assert.equal(await page.evaluate(() => {
    const diagnostics = (window as unknown as { __lagonDebug: Debug }).__lagonDebug;
    return Object.isFrozen(diagnostics) && Object.values(Object.getOwnPropertyDescriptors(diagnostics))
      .every(descriptor => typeof descriptor.get === 'function' && descriptor.set === undefined);
  }), true, 'production diagnostics expose read-only getters, without mutation commands');
  const state = await debug(page); hostId = state.sessionId;
  const roomId = new URL(await page.locator('#share-url').inputValue()).pathname.split('/').pop()!;
  const live = matchMaker.getLocalRoomById(roomId) as RaceRoom;
  assert.ok(live, 'only a locally owned test room may receive fixtures');
  observer = await new Client(origin.replace(/^http/, 'ws')).joinById(roomId, { name: 'Observation SDK', color: '#60a5fa' });
  observer.onMessage('notice', () => {});
  observer.onMessage('snapshot', ({ world }: { world: World }) => {
    observerWorld = world;
    for (const object of world.objects) seenObjects.set(object.kind, object);
    const kart = world.players.find(player => player.id === hostId);
    if (!observedEffect || !kart) return;
    const remaining = kart[observedEffect];
    if (remaining > 0 && !durations[observedEffect]) durations[observedEffect] = { first: world.time, remaining };
    const effect = durations[observedEffect];
    if (remaining === 0 && effect && effect.end === undefined) {
      effect.end = world.time; effect.elapsed = effect.end - effect.first;
    }
  });
  await until(() => observerWorld?.players.length === 2, 'second client connecté');
  observer.send('ready', { ready: true });
  await page.locator('#ready-button').click();
  await page.locator('#start-button').click();
  await page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.phase === 'racing');
  await page.keyboard.down('ArrowDown'); // Brake/reverse through the ordinary controls while testing objects.
  const host = () => live.world.players.find(player => player.id === hostId)!;
  const peer = () => live.world.players.find(player => player.id === observer!.sessionId)!;
  const reposition = (kart: Kart, progress: number) => {
    const point = trackPoint(progress, live.world.trackId);
    Object.assign(kart, point, { speed: 0, boost: 0, stun: 0, progress, lateralVelocity: 0, turnVelocity: 0 });
  };
  const grant = async (item: Item, label: string) => {
    reposition(host(), 25); reposition(peer(), 130);
    live.world.pickups = []; live.world.objects = [];
    Object.assign(host(), { item, itemCharges: item === 'tripleTurbo' ? 3 : 1, itemLatch: false,
      invincible: 0, shield: 0, hitGrace: 0 });
    fixtures.push(`Grant ${item} to browser driver; positions 25 m / 130 m; remove pickups and previous objects.`);
    await waitItem(page, item);
    await page.waitForFunction(expected => document.querySelector('#item-name')?.textContent?.includes(expected), label);
    hudEvidence[item] = await page.locator('#item-card').innerText();
  };
  record('Navigateur pilote et second client SDK connectés au serveur privé éphémère');

  await grant('tripleTurbo', 'Triple turbo');
  assert.match(await page.locator('#item-card').innerText(), /3/);
  await page.screenshot({ path: 'test-results/items-triple.png' });
  for (const remaining of [2, 1, 0]) {
    await page.keyboard.press('KeyE', { delay: 80 });
    await waitItem(page, remaining ? 'tripleTurbo' : '', remaining);
    await sleep(400);
    assert.equal(host().itemCharges, remaining, 'one keyboard press consumes exactly one charge');
    if (remaining) assert.match(await page.locator('#item-card').innerText(), new RegExp(String(remaining)));
  }
  record('Triple turbo : HUD 3 → 2 → 1 → vide après trois pressions E distinctes');

  for (const [item, label, objectKind] of [
    ['turbo', 'Turbo', undefined], ['trap', 'Balise piège', 'trap'], ['projectile', 'Disque vert', 'projectile'],
    ['seeker', 'Fusée rouge', 'seeker'], ['leaderBolt', 'Comète bleue', 'leaderBolt'],
  ] as const) {
    await grant(item, label);
    if (objectKind) seenObjects.delete(objectKind);
    await page.keyboard.press('KeyE', { delay: 80 });
    await waitItem(page, '', 0);
    if (objectKind) {
      await until(() => seenObjects.has(objectKind), 'objet reçu par le second client : ' + objectKind);
      if (objectKind === 'seeker' || objectKind === 'leaderBolt') assert.equal(seenObjects.get(objectKind)!.targetId, peer().id);
    }
  }
  record('Turbo, piège, projectile vert, fusée rouge et comète bleue : libellés HUD et activations reçues par le SDK');

  for (const [item, label, field, seconds] of [
    ['star', 'Étoile', 'invincible', 5.5], ['shield', 'Bouclier', 'shield', 8],
  ] as const) {
    await grant(item, label); observedEffect = field;
    await page.keyboard.press('KeyE', { delay: 80 });
    await until(() => !!durations[field], label + ' actif');
    await page.waitForFunction(expected => document.querySelector('#item-effect')?.textContent?.includes(expected),
      field === 'invincible' ? 'Invincible' : 'Bouclier');
    hudEvidence[field] = await page.locator('#item-effect').innerText();
    assert.match(hudEvidence[field]!, /\d.*s/);
    await until(() => durations[field]?.end !== undefined, label + ' expiré', 14000);
    const effect = durations[field]!;
    assert.ok(effect.remaining <= seconds && effect.remaining > seconds - .25);
    assert.ok(Math.abs(effect.elapsed! - seconds) < .25, JSON.stringify(effect));
    await page.waitForFunction(() => !document.querySelector('#item-effect')?.textContent?.trim());
    observedEffect = undefined;
    record(`${label} : durée serveur ${effect.elapsed!.toFixed(2)} s et compteur HUD qui disparaît à expiration`);
  }

  // Final screenshot is explicitly staged and frozen, so the fast projectiles
  // and both protection effects remain visible even on a slow software GPU.
  // No production route, client mutation hook or external server is involved.
  const activatedObjects = [...seenObjects.values()].map(object => structuredClone(object));
  live.setSimulationInterval(() => {}, 1000 / 30);
  const point = trackPoint(25, live.world.trackId);
  reposition(host(), 25);
  Object.assign(host(), { item: 'tripleTurbo', itemCharges: 3, invincible: 4, shield: 0 });
  Object.assign(peer(), { x: point.x + Math.sin(point.angle) * 6 + Math.cos(point.angle) * 3,
    z: point.z + Math.cos(point.angle) * 6 - Math.sin(point.angle) * 3, angle: point.angle,
    speed: 0, boost: 0, invincible: 0, shield: 7 });
  live.world.objects = (['projectile', 'seeker', 'leaderBolt'] as const).map((kind, index) => ({
    id: 'fixture-' + kind, kind, owner: hostId, targetId: peer().id, ttl: 30, angle: point.angle,
    x: point.x + Math.sin(point.angle) * 9 + Math.cos(point.angle) * ((index - 1) * 3),
    z: point.z + Math.cos(point.angle) * 9 - Math.sin(point.angle) * ((index - 1) * 3),
  }));
  fixtures.push('Screenshot only: pause private room simulation; star=4 s, shield=7 s, triple turbo=3; arrange green/red/blue objects 9 m ahead. These values do not measure duration or a complete race.');
  await page.waitForFunction(() => {
    const state = (window as unknown as { __lagonDebug: Debug }).__lagonDebug;
    return state.world?.objects.some(object => object.id === 'fixture-leaderBolt')
      && state.world.players.some(kart => kart.shield === 7) && state.kartAssets.status === 'ready';
  });
  await sleep(600);
  await page.screenshot({ path: 'test-results/items-effects.png' });
  record('Capture mise en scène : aura étoile, bouclier et projectiles vert/rouge/bleu dans le même rendu');
  assert.deepEqual(errors, []);
  record('Aucune erreur JavaScript ni ressource assets/modèles en erreur');
  await writeFile('test-results/items-browser.json', JSON.stringify({ origin, checks, errors, fixtures,
    scope: 'Private server fixtures and genuine E keyboard activations; no full race and no public Docker mutations.',
    clients: 'One Chromium/SwiftShader browser driver and one independent Colyseus SDK client.',
    hudEvidence, durations, activatedObjects, screenshots: ['items-triple.png', 'items-effects.png'] }, null, 2));
  await page.keyboard.up('ArrowDown');
  await page.locator('#leave-button').click();
  await page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world === null);
  await context.close();
} finally {
  if (observer?.connection.isOpen) await observer.leave();
  await browser.close();
  await gameServer.gracefullyShutdown(false);
}
