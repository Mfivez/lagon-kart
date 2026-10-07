/** Private real-browser presence checks: no public profiles, MMR or room mutations. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { PresenceSnapshot } from '../shared/presence.js';
import type { PlayerProfile } from '../shared/progression.js';

const directory = await mkdtemp(join(tmpdir(), 'lagon-presence-browser-'));
const output = resolve(process.env.REPORT_DIR || 'docs/presence');
await mkdir(output, { recursive: true });
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { createGameServer } = await import('../server/app.js');
const { gameServer, httpServer, ready } = createGameServer();
await ready; await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const errors: string[] = [], checks: string[] = [];
const report: Record<string, unknown> = { executedAt: new Date().toISOString(), checks, errors, environment: 'Private Node HTTP/Colyseus server + Chromium, isolated temporary player data' };
const until = async (predicate: () => Promise<boolean>, label: string, timeout = 35_000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(done => setTimeout(done, 120)); }
  throw new Error('Timed out: ' + label);
};
const snapshot = async () => await (await fetch(origin + '/api/presence')).json() as PresenceSnapshot;
const createProfile = async (name: string) => await (await fetch(origin + '/api/profile', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json() as { token: string; profile: PlayerProfile };
const observe = (page: Page) => { page.on('pageerror', error => errors.push(error.message)); };
const prepare = async (context: BrowserContext, identity: Awaited<ReturnType<typeof createProfile>>) => {
  await context.addInitScript(({ token, name, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name);
    localStorage.setItem('lagon-volume', '0');
  }, { token: identity.token, name: identity.profile.name, origin });
};
const readCount = async (page: Page) => await page.locator('#online-player-count').textContent();

try {
  const bob = await createProfile('Bob Classé');
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const mobile = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await prepare(desktop, bob);
  const bobPage = await desktop.newPage(); observe(bobPage); await bobPage.goto(origin, { waitUntil: 'domcontentloaded' });
  const alicePage = await mobile.newPage(); observe(alicePage); await alicePage.goto(origin, { waitUntil: 'domcontentloaded' });
  await until(async () => await readCount(alicePage) === '2 connectés' && await readCount(bobPage) === '2 connectés', 'both home pages display two connected profiles');
  const alice = (await snapshot()).players.find(player => player.id !== bob.profile.id)!;
  assert.ok(alice); assert.equal(alice.name, 'Pilote');
  let nicknameWrites = 0;
  alicePage.on('request', request => { if (new URL(request.url()).pathname === '/api/me' && request.method() === 'PATCH') nicknameWrites++; });
  await alicePage.locator('#name-input').fill('Alice Atelier');
  await alicePage.waitForTimeout(200); assert.equal(nicknameWrites, 0);
  await alicePage.locator('#name-input').press('Tab');
  await until(async () => (await snapshot()).players.find(player => player.id === alice.id)?.name === 'Alice Atelier', 'guest nickname saved on change without joining a course');
  await until(async () => (await bobPage.locator(`[data-player-id="${alice.id}"] strong`).textContent())?.includes('Alice Atelier') === true, 'other profile sees nickname change at home');
  checks.push('A fresh guest starts as Pilote; changing the nickname at home updates another browser before any race');
  assert.equal(nicknameWrites, 1);

  let releaseRename!: () => void, renameStarted!: () => void;
  const heldRename = new Promise<void>(done => { releaseRename = done; });
  const renameRequest = new Promise<void>(done => { renameStarted = done; });
  await alicePage.route('**/api/me', async route => {
    if (route.request().method() === 'PATCH' && route.request().postDataJSON()?.name === 'Alice Sauvegarde') {
      renameStarted(); await heldRename;
    }
    await route.continue();
  });
  await alicePage.locator('#name-input').fill('Alice Sauvegarde');
  await alicePage.locator('#name-input').press('Tab'); await renameRequest;
  await alicePage.locator('#name-input').fill('Alice Atelier');
  const savedResponse = alicePage.waitForResponse(response => new URL(response.url()).pathname === '/api/me' && response.request().method() === 'PATCH');
  releaseRename(); await (await savedResponse).finished(); await alicePage.waitForTimeout(150);
  assert.equal(await alicePage.locator('#name-input').inputValue(), 'Alice Atelier');
  await alicePage.locator('#name-input').press('Tab');
  await until(async () => (await snapshot()).players.find(player => player.id === alice.id)?.name === 'Alice Atelier', 'latest typed nickname saved after delayed previous response');
  await alicePage.unroute('**/api/me');
  checks.push('Typing sends no PATCH per keystroke; a delayed save cannot overwrite newer nickname text');
  assert.equal(await alicePage.locator('#online-player-list li').count(), 2);
  assert.equal(await alicePage.locator(`[data-player-id="${alice.id}"] small`).innerText(), 'Vous');
  checks.push('Two isolated browser profiles see each other at home; public count and own-player label agree');

  const duplicate = await desktop.newPage(); observe(duplicate); await duplicate.goto(origin, { waitUntil: 'domcontentloaded' });
  await until(async () => await readCount(duplicate) === '2 connectés', 'duplicate tab remains deduplicated');
  assert.equal((await snapshot()).connected, 2);
  await duplicate.goto('about:blank'); await duplicate.close();
  await until(async () => (await snapshot()).connected === 2, 'closing one duplicate keeps the profile online');
  checks.push('Three tabs still count two profiles; closing one Bob tab leaves the other connected');

  await bobPage.locator('#career-button').click();
  await bobPage.locator('#ranked-join').click();
  await until(async () => (await snapshot()).searchingRanked === 1, 'real authenticated queue contains Bob');
  await until(async () => await alicePage.locator('#online-ranked-count').textContent() === '1 en recherche classée', 'mobile observer receives ranked search');
  assert.equal(await alicePage.locator(`[data-player-id="${bob.profile.id}"]`).getAttribute('data-status'), 'ranked-search');
  await alicePage.locator('#online-players').evaluate(panel => panel.scrollIntoView({ block: 'center' }));
  const bounds = await alicePage.locator('#online-players').boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320.5);
  await alicePage.screenshot({ path: join(output, 'mobile-320-presence.png') });
  checks.push('Real UI ranked search is visible from a different mobile profile; 320 px panel stays within viewport');

  await bobPage.locator('#ranked-cancel').click();
  await until(async () => (await snapshot()).searchingRanked === 0, 'real queue cancellation');
  await bobPage.locator('#career-close').click();
  await until(async () => await readCount(bobPage) === '2 connectés' && await bobPage.locator('#online-ranked-count').textContent() === '0 en recherche classée', 'desktop presence refresh after cancellation');
  await bobPage.locator('#online-players').scrollIntoViewIfNeeded();
  await bobPage.screenshot({ path: join(output, 'desktop-presence.png') });
  checks.push('Cancelling from the career dialog clears the authoritative search count');

  await bobPage.locator('#practice-button').click();
  await until(async () => (await snapshot()).players.find(player => player.id === bob.profile.id)?.status === 'practice', 'real practice room classified');
  await until(async () => await alicePage.locator(`[data-player-id="${bob.profile.id}"]`).getAttribute('data-status') === 'practice', 'mobile observer sees human in practice');
  assert.equal((await snapshot()).connected, 2);
  await bobPage.locator('#leave-button').click();
  await until(async () => (await snapshot()).players.find(player => player.id === bob.profile.id)?.status === 'home', 'return home after real room leave');
  checks.push('A real solo room displays En entraînement and leaving returns the same profile home');

  await bobPage.goto('about:blank');
  await until(async () => (await snapshot()).connected === 1, 'unloading final tab removes Bob');
  await until(async () => await readCount(alicePage) === '1 connecté', 'remaining observer sees disconnected pilot removed');
  checks.push('Unloading the final profile tab removes that player; remaining browser updates to one connected');
  assert.deepEqual(errors, []);
  report.finalPresence = await snapshot(); report.result = 'pass';
  report.limits = ['Phone viewport/touch are emulated; no physical phone was used', '45-second abrupt-network expiry is covered by deterministic unit tests, not a 45-second browser sleep'];
  console.log(JSON.stringify({ result: 'pass', checks: checks.length, output }));
} catch (error) {
  report.result = 'fail'; report.failure = String(error); process.exitCode = 1; console.error(error);
} finally {
  await writeFile(join(output, 'browser-validation.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
}
