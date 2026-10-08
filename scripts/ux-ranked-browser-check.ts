/** Private browser UX validation. Real queue/transport; the ranked finish alone
 * uses a declared isolated-server fixture, never a production mutation API. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Page } from 'playwright';
import jsQR from 'jsqr';
import type { World } from '../shared/game.js';
import type { PlayerProfile } from '../shared/progression.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { getTrack, getTrackLapCount } from '../shared/track.js';

const directory = await mkdtemp(join(tmpdir(), 'lagon-ux-ranked-')), output = resolve(process.env.LAGON_UX_OUTPUT ?? 'docs/ux-ranked'); await mkdir(output, { recursive: true });
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { createGameServer } = await import('../server/app.js'), { matchMaker } = await import('@colyseus/core');
const { rankedQueue } = await import('../server/career.js');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client')); await ready; await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const checks: string[] = [], errors: string[] = [], captures: string[] = [], requests: string[] = [];
const evidence: Record<string, unknown> = { origin, executedAt: new Date().toISOString(), checks, errors, captures };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, label: string, timeout = 35000) { const end = Date.now() + timeout; while (!await predicate()) { if (Date.now() > end) throw Error(label); await pause(100); } }
const state = async (page: Page) => page.evaluate(() => { const debug = (window as unknown as { __lagonDebug: { world: World | null; sessionId: string | null } }).__lagonDebug; return { world: debug.world, sessionId: debug.sessionId }; });
async function api(path: string, token?: string, body?: unknown) {
  const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${path}: ${response.status}`); return response.json();
}
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function capture(page: Page, name: string) {
  const session = await page.context().newCDPSession(page);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try { const result = await Promise.race([session.send('Page.captureScreenshot', { format: 'png', fromSurface: false }), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Capture timed out')), 20000); })]); await writeFile(join(output, name), Buffer.from(result.data, 'base64')); captures.push(name); }
  finally { clearTimeout(deadline); await session.detach(); }
}
async function home(page: Page) { if (await page.locator('#leave-button').isVisible()) await page.locator('#leave-button').click(); await until(async () => !(await state(page)).world, 'Return home'); }
try {
  const html = await fetch(origin).then(response => response.text()); evidence.assets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const identities: Array<{ token: string; profile: PlayerProfile }> = [];
  identities.push(await api('/api/profile', undefined, { name: 'Classement Alice' })); identities.push(await api('/api/profile', undefined, { name: 'Classement Bob' }));
  identities[0] = await api('/api/account/register', identities[0]!.token, { username: 'ux-alice', password: 'test-local-2026' });
  const contexts = [await browser.newContext({ viewport: { width: 1280, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] }), await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })];
  const pages: Page[] = [];
  for (const [index, context] of contexts.entries()) {
    const identity = identities[index]!; await context.addInitScript(({ token, name, origin }) => { if (location.origin !== origin) return; localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name); localStorage.setItem('lagon-volume', '0'); }, { token: identity.token, name: identity.profile.name, origin });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000); pages.push(page);
  }
  const [host, guest] = pages as [Page, Page];
  let releaseProfile!: () => void; const heldProfile = new Promise<void>(resolve => { releaseProfile = resolve; });
  await host.route('**/api/me', async route => { if (route.request().method() === 'GET') await heldProfile; await route.continue(); });
  await host.goto(origin, { waitUntil: 'domcontentloaded' }); await host.locator('#home-ranked').waitFor();
  assert.match(await host.locator('[data-ranked-grade]').innerText(), /Chargement/); assert.equal(await host.locator('[data-ranked-mmr]').innerText(), ''); releaseProfile();
  await until(async () => (await host.locator('[data-ranked-mmr]').innerText()) === '800 MMR', 'Authoritative rating restored'); await host.unroute('**/api/me');
  await guest.goto(origin, { waitUntil: 'domcontentloaded' }); await until(async () => (await guest.locator('[data-ranked-mmr]').innerText()) === '800 MMR', 'Mobile rating restored');
  assert.equal(await guest.locator('[data-ranked-grade]').innerText(), 'Bronze');
  assert.equal(await guest.locator('#home-ranked').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
  evidence.mobileHomeBoxes = {};
  for (const id of ['home-ranked', 'create-button', 'join-button', 'practice-button']) {
    const box = await guest.locator(`#${id}`).boundingBox(); assert.ok(box && box.y >= 0 && box.y + box.height <= 568, `${id} must be visible without scrolling at 320×568`);
    (evidence.mobileHomeBoxes as Record<string, unknown>)[id] = box;
  }
  await capture(guest, 'home-ranked-mobile-320.png'); record('Accueil : grade et MMR serveur, chargement réel sans classement inventé, carte lisible sur mobile 320 px.');
  host.on('request', request => { if (new URL(request.url()).pathname === '/api/ranked') requests.push(request.method()); });
  await host.locator('#home-ranked-action').click(); await until(async () => (await host.locator('#home-ranked-action').innerText()).includes('Annuler'), 'Queue active');
  await host.locator('#home-tab-options').click(); await host.locator('#career-button').click(); await host.locator('#career-close').click(); await host.locator('#home-tab-play').click(); await pause(2800);
  assert.equal(rankedQueue.poll(identities[0]!.profile.id).state, 'queued'); assert.equal(requests.filter(method => method === 'POST').length, 1);
  await capture(host, 'home-ranked-search.png'); await host.locator('#home-ranked-action').click(); await until(async () => rankedQueue.poll(identities[0]!.profile.id).state === 'idle', 'Explicit cancellation reaches server');
  let failed = false; await host.route('**/api/ranked', async route => { if (!failed && route.request().method() === 'POST') { failed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Erreur réseau de test, réessayez.' }) }); } else await route.continue(); });
  await host.locator('#home-ranked-action').click(); await until(async () => (await host.locator('#home-ranked-action').innerText()).includes('Réessayer'), 'Recoverable network error'); await host.unroute('**/api/ranked');
  await host.locator('#home-ranked-action').click(); await until(async () => rankedQueue.poll(identities[0]!.profile.id).state === 'queued', 'Retry queue');
  await host.locator('#create-button').click(); await until(async () => (await state(host)).world?.phase === 'lobby', 'Switch from queue to room');
  assert.equal(rankedQueue.poll(identities[0]!.profile.id).state, 'idle'); record('Recherche unique continue après fermeture du menu ; annulation réelle, erreur récupérable et annulation avant un salon libre.');
  const code = (await host.locator('#room-code').innerText()).trim(), invite = `${origin}/room/${code}`;
  await host.locator('#invite-share').click(); assert.equal(await host.evaluate(() => navigator.clipboard.readText()), invite);
  await host.locator('#invite-qr').click(); await host.locator('.invitation-dialog canvas').waitFor();
  const bitmap = await host.locator('.invitation-dialog canvas').evaluate(node => { const canvas = node as HTMLCanvasElement; return { width: canvas.width, height: canvas.height, data: Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data) }; });
  const decoded = jsQR(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height)?.data; assert.equal(decoded, invite); evidence.qrDecoded = decoded;
  await capture(host, 'invitation-qr-desktop.png'); await host.locator('.invitation-dialog [data-close]').click();
  await guest.goto(decoded!, { waitUntil: 'domcontentloaded' }); if (!(await state(guest)).world) await guest.locator('#join-button').tap();
  await until(async () => (await state(guest)).world?.players.length === 2, 'Decoded QR link joins actual room');
  await guest.locator('#invite-qr').tap(); await capture(guest, 'invitation-qr-mobile-320.png'); await guest.locator('.invitation-dialog [data-close]').tap();
  await host.evaluate("Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.shared = data; } })");
  await host.locator('#invite-share').click(); assert.equal(await host.evaluate(() => (window as unknown as { shared?: ShareData }).shared?.url), invite);
  record('QR du canvas réellement décodé puis lien ouvert par le second profil ; copie locale et contrat de partage natif vérifiés.');
  await home(guest); await home(host);
  await host.locator('#home-ranked-action').click(); await until(async () => rankedQueue.poll(identities[0]!.profile.id).state === 'queued', 'Queue before editor');
  await host.locator('#home-tab-options').click(); await host.locator('#track-editor-button').click(); await host.locator('#track-editor-dialog').waitFor({ state: 'visible' });
  assert.equal(rankedQueue.poll(identities[0]!.profile.id).state, 'idle');
  await host.locator('#editor-close').click(); await host.locator('#track-editor-dialog').waitFor({ state: 'hidden' }); await host.locator('#home-tab-play').click();
  record('Entrer dans l’éditeur annule aussi la recherche serveur avant d’ouvrir l’atelier.');
  await host.locator('#home-ranked-action').click(); await guest.locator('#home-ranked-action').tap();
  await until(async () => !!(await state(host)).world?.ranked && !!(await state(guest)).world?.ranked, 'Two profiles matched by real queue', 50000);
  const roomId = (await host.locator('#room-code').innerText()).trim(); assert.equal((await guest.locator('#room-code').innerText()).trim(), roomId);
  await host.locator('#ready-button').click(); await guest.locator('#ready-button').tap();
  // Ranked rooms start automatically when every reserved profile is ready.
  await until(async () => (await state(host)).world?.phase === 'racing', 'Real ranked countdown');
  const live = matchMaker.getLocalRoomById(roomId) as RaceRoom;
  live.world.raceTime = 60; await pause(120);
  live.world.players.forEach((kart, index) => { kart.finished = true; kart.lap = getTrackLapCount(live.world.trackId); kart.finishTime = 50 + index; kart.progress = getTrack(live.world.trackId).length * kart.lap; kart.speed = 0; });
  await until(async () => (await state(host)).world?.phase === 'finished', 'Private finish fixture classified');
  await until(async () => (await api('/api/me', identities[0]!.token)).profile.mmr !== 800, 'Authoritative MMR persisted');
  await home(guest); await home(host);
  const saved = (await api('/api/me', identities[0]!.token)).profile as PlayerProfile; await until(async () => (await host.locator('[data-ranked-mmr]').innerText()) === `${saved.mmr} MMR`, 'Home refreshed from server result'); evidence.result = { mmr: saved.mmr, rank: saved.rank };
  await capture(host, 'home-ranked-updated.png'); record('Deux profils appariés par la vraie file, même salon classé et départ ; après résultat privé déclaré, le MMR serveur actualise l’accueil.');
  await host.locator('#home-tab-pilot').click();
  await host.locator('[data-account="logout"]').click(); await until(async () => !(await host.locator('[data-ranked-mmr]').innerText()).includes(String(saved.mmr)), 'Logout clears previous rating');
  await host.locator('[data-account="login"]').click(); await host.locator('#account-username').fill('ux-alice'); await host.locator('#account-password').fill('test-local-2026'); await host.locator('#account-submit').click();
  await until(async () => (await host.locator('[data-ranked-mmr]').innerText()) === `${saved.mmr} MMR`, 'Account login restores authoritative rating'); record('Déconnexion retire l’ancien classement ; connexion au compte rétablit le MMR sauvegardé sans recharger la page.');
  assert.deepEqual(errors, []); await host.close(); await guest.close();
  await until(async () => (await api('/healthz')).rooms === 0, 'Private rooms all disposed'); evidence.passed = true;
  evidence.fixtures = ['Profil temporaire et serveur isolés dans /tmp.', 'GET profil retenu et POST recherche 503 intercepté pour états chargement/erreur.', 'navigator.share simulé uniquement pour son contrat ; pas de panneau système natif dans Chromium headless.', 'Arrivée classée privée raccourcie : horloge 60 s puis pilotes finis ; calcul MMR et actualisation restent serveur/client réels. Aucun classement public modifié.'];
} catch (error) { evidence.passed = false; evidence.error = String(error); process.exitCode = 1; console.error(error); }
finally { await browser.close(); await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true }); await writeFile(join(output, 'browser-validation.json'), JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify({ passed: evidence.passed, checks: checks.length, captures, browserClosed: true })); }
