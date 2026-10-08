import { homeControl } from './menu-navigation.js';
/** Public smoke with existing test identities. Never enters ranked, publishes a
 * circuit, injects game state, or closes anybody else's room. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import jsQR from 'jsqr';
import type { World } from '../shared/game.js';
import type { PlayerProfile } from '../shared/progression.js';

const origin = process.env.BASE_URL?.replace(/\/$/, ''); assert.ok(origin, 'BASE_URL must identify the authorized deployment');
const saved = JSON.parse(await readFile(process.env.IDENTITY_FILE || '/tmp/lagon-party-public-identities.json', 'utf8')) as { origin: string; identities: Array<{ token: string; profile: PlayerProfile }> };
assert.equal(saved.origin, origin); assert.equal(saved.identities.length, 2);
const output = resolve(process.env.REPORT_DIR || 'docs/ux-ranked/public'); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const checks: string[] = [], errors: string[] = [], captures: string[] = [], chunks = new Set<string>(), sockets = new Set<string>();
const evidence: Record<string, unknown> = { origin, startedAt: new Date().toISOString(), checks, errors, captures, fixtures: [] };
const pages: Page[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, label: string, timeout = 35000) { const end = Date.now() + timeout; while (!await predicate()) { if (Date.now() > end) throw Error(label); await pause(150); } }
async function api(path: string, token?: string) { const response = await fetch(origin + path, { signal: AbortSignal.timeout(20000), headers: token ? { authorization: `Bearer ${token}` } : {} }); assert.ok(response.ok, `${path}: ${response.status}`); return response.json(); }
async function state(page: Page) { return page.evaluate(() => { const debug = (window as unknown as { __lagonDebug: { world: World | null; sessionId: string | null; quality: unknown } }).__lagonDebug; return { world: debug.world, sessionId: debug.sessionId, quality: debug.quality }; }); }
async function capture(page: Page, name: string) { await page.screenshot({ path: join(output, name), timeout: 20000 }); captures.push(name); }
async function leave(page: Page) { if (page.isClosed()) return; if (await page.locator('#leave-button').isVisible()) { await page.locator('#leave-button').click(); await until(async () => !(await state(page)).world, 'Leave our room'); } }
const record = (value: string) => { checks.push(value); console.log('✓ ' + value); };
try {
  evidence.healthBefore = await api('/healthz'); const catalogueBefore = (await api('/api/tracks')).tracks; evidence.catalogueBefore = catalogueBefore.map((track: { id: string; revision: number }) => [track.id, track.revision]);
  const before = await Promise.all(saved.identities.map(async identity => (await api('/api/me', identity.token)).profile as PlayerProfile));
  const contexts = [await browser.newContext({ viewport: { width: 1280, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] }), await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })];
  for (const [index, context] of contexts.entries()) {
    const identity = saved.identities[index]!;
    await context.addInitScript(({ origin, token, name }) => { if (location.origin !== origin) return; localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name); localStorage.setItem('lagon-volume', '0'); }, { origin, token: identity.token, name: before[index]!.name });
    const page = await context.newPage(); page.setDefaultTimeout(30000); pages.push(page); page.on('pageerror', error => errors.push(error.message)); page.on('websocket', socket => sockets.add(socket.url()));
    page.on('response', response => { const url = new URL(response.url()); if (url.pathname.endsWith('.js')) chunks.add(response.url()); if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${url.pathname}`); });
    await page.route('**/api/ranked', async route => { errors.push('Unexpected public ranked request blocked'); await route.abort(); });
    await page.route('**/api/tracks**', async route => { if (route.request().method() !== 'GET') { errors.push('Unexpected public track publication blocked'); await route.abort(); } else await route.continue(); });
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  }
  const [host, guest] = pages as [Page, Page];
  await until(async () => (await guest.locator('[data-ranked-mmr]').innerText()) === `${before[1]!.mmr} MMR`, 'Mobile rating from server');
  evidence.grade = { server: before[1]!.rank, displayed: await guest.locator('[data-ranked-grade]').innerText(), mmr: before[1]!.mmr };
  for (const id of ['home-ranked', 'create-button', 'practice-button', 'join-button']) { const box = await guest.locator(`#${id}`).boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 568); }
  await capture(guest, 'public-home-mobile-320.png');
  await (await homeControl(host, '#graphics-quality')).selectOption('smooth'); assert.equal(await host.locator('#graphics-quality').inputValue(), 'smooth');
  await until(async () => (await state(host)).quality === 'light', 'Smooth quality applied to actual renderer');
  await (await homeControl(host, '#create-button')).click(); await until(async () => (await state(host)).world?.phase === 'lobby', 'Normal public test room');
  const roomId = (await host.locator('#room-code').innerText()).trim(); evidence.roomId = roomId;
  await host.locator('#invite-qr').click(); const image = await host.locator('.invitation-dialog canvas').evaluate(node => { const canvas = node as HTMLCanvasElement; return { width: canvas.width, height: canvas.height, pixels: Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) }; });
  const decoded = jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height)?.data; assert.equal(decoded, `${origin}/room/${roomId}`); evidence.qrDecoded = decoded;
  await capture(host, 'public-qr-desktop.png'); await host.locator('.invitation-dialog [data-close]').click();
  await guest.goto(decoded!, { waitUntil: 'domcontentloaded' }); if (!(await state(guest)).world) await (await homeControl(guest, '#join-button')).tap();
  await until(async () => (await state(guest)).world?.players.length === 2, 'Second profile joined the decoded room');
  const readyBefore = await guest.locator('#ready-button').boundingBox(); assert.ok(readyBefore && readyBefore.y >= 0 && readyBefore.y + readyBefore.height <= 568);
  await guest.locator('.lobby-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const readyAfter = await guest.locator('#ready-button').boundingBox(); assert.ok(readyAfter && Math.abs(readyAfter.y - readyBefore.y) < 1);
  await guest.locator('#ready-button').tap(); await host.locator('#ready-button').click(); await until(async () => await host.locator('#start-button').isEnabled(), 'Two real ready confirmations');
  await capture(guest, 'public-lobby-mobile-320.png'); record('Accueil 320 px avec vrai grade/MMR, QR HTTPS décodé, deuxième profil connecté et bouton Prêt fixe après défilement.');
  await host.locator('#start-button').click(); await until(async () => (await state(host)).world?.phase === 'racing' && (await state(guest)).world?.phase === 'racing', 'Normal public countdown');
  const initial = (await state(host)).world!.players.map(kart => ({ id: kart.id, x: kart.x, z: kart.z }));
  await host.keyboard.down('ArrowUp');
  try { await until(async () => { const players = (await state(host)).world!.players; return initial.every(start => { const kart = players.find(value => value.id === start.id)!; return Math.hypot(kart.x - start.x, kart.z - start.z) > 2; }); }, 'Both pilots move through real inputs', 15000); }
  finally { await host.keyboard.up('ArrowUp'); }
  const moved = (await state(host)).world!.players; assert.ok(initial.every(start => { const kart = moved.find(value => value.id === start.id)!; return Math.hypot(kart.x - start.x, kart.z - start.z) > 2; }), 'Both profiles must move via ordinary controls');
  evidence.movement = moved.map(kart => ({ name: kart.name, progress: kart.progress, speed: kart.speed })); evidence.quality = (await state(host)).quality;
  await capture(guest, 'public-driving-mobile-320.png'); await leave(guest); await leave(host); record('Deux pilotes conduisent réellement via HTTPS/WSS ; qualité Fluide choisie ; retour à l’accueil sans arrivée imposée.');
  await (await homeControl(host, '#track-editor-button')).click(); await host.locator('#editor-name').fill('Brouillon smoke privé'); await host.locator('#editor-name').press('Tab'); await host.locator('#editor-try').click();
  await until(async () => { const world = (await state(host)).world; return world?.phase === 'racing' && world.trackId.startsWith('custom-private-'); }, 'Unpublished public draft trial');
  evidence.previewTrackId = (await state(host)).world!.trackId;
  await host.keyboard.down('ArrowUp');
  try { await until(async () => ((await state(host)).world?.players[0]?.speed ?? 0) > 2, 'Ordinary throttle in private draft', 15000); }
  finally { await host.keyboard.up('ArrowUp'); }
  assert.ok((await state(host)).world!.players[0]!.speed > 0); await capture(host, 'public-private-draft.png'); await leave(host);
  await host.locator('#track-editor-dialog').waitFor({ state: 'visible' }); assert.equal(await host.locator('#editor-name').inputValue(), 'Brouillon smoke privé');
  const catalogueAfter = (await api('/api/tracks')).tracks;
  assert.deepEqual(catalogueAfter, catalogueBefore, 'Private draft must not publish or mutate the catalogue');
  for (const [index, identity] of saved.identities.entries()) assert.equal((await api('/api/me', identity.token)).profile.mmr, before[index]!.mmr);
  evidence.catalogueAfter = catalogueAfter.map((track: { id: string; revision: number }) => [track.id, track.revision]);
  assert.ok([...chunks].some(url => /invitation-qr-.*\.js/.test(url))); assert.ok([...chunks].every(url => new URL(url).origin === origin));
  assert.ok(sockets.size >= 2 && [...sockets].every(url => url.startsWith(origin.replace('https:', 'wss:').replace('http:', 'ws:'))));
  record('Essai du brouillon non publié, retour éditeur intact, catalogue et MMR inchangés ; chunks servis par la même origine sans erreur.');
  for (const page of pages) await page.close();
  await until(async () => !(await api('/api/presence')).players.some((player: { id: string; status: string }) => saved.identities.some(identity => identity.profile.id === player.id) && ['lobby', 'racing', 'results', 'practice'].includes(player.status)), 'Our profiles left all test rooms');
  evidence.healthAfter = await api('/healthz'); evidence.chunks = [...chunks]; evidence.websockets = [...sockets]; assert.deepEqual(errors, []); evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.error = String(error); process.exitCode = 1; console.error(error); }
finally { for (const page of pages) await leave(page).catch(() => {}); await browser.close(); evidence.finishedAt = new Date().toISOString(); await writeFile(join(output, 'browser-validation.json'), JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify({ passed: evidence.passed, checks: checks.length, captures, browserClosed: true })); }
