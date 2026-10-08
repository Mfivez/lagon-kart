/** Destructive actions run only against a disposable server/store created here.
 * Accounts and circuits are prepared through authenticated HTTP APIs, then the
 * built browser client performs publication, moderation and confirmation. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { CUSTOM_TRACK_TEMPLATES, type StoredCustomTrack } from '../shared/custom-tracks.js';
import type { PlayerProfile } from '../shared/progression.js';
import { homeControl, openTrackCatalog, refreshHomeTracks, selectHomeTrack } from './menu-navigation.js';

const output = resolve(process.env.REPORT_DIR ?? 'docs/track-deletion');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-track-deletion-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players');
process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { createGameServer } = await import('../server/app.js');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client'));
await ready; await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
type Identity = { token: string; profile: PlayerProfile };
const checks: string[] = [], captures: string[] = [], errors: string[] = [];
const evidence: Record<string, unknown> = {
  origin, startedAt: new Date().toISOString(),
  scope: 'Built client and real private server; disposable accounts and circuits. Desktop Chromium and mobile touch emulation.',
  limitations: ['No physical phone or Safari iOS tested.', 'Running races and replay persistence are covered separately by server tests.'],
};
let browser: Browser | undefined, currentPage: Page | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, message: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > deadline) throw new Error(message); await pause(100); }
}
function record(message: string) { checks.push(message); console.log('✓ ' + message); }
async function request(path: string, method = 'GET', token?: string, body?: unknown) {
  return fetch(origin + path, { method, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function api<T>(path: string, method = 'GET', token?: string, body?: unknown): Promise<T> {
  const response = await request(path, method, token, body);
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
  return response.json() as Promise<T>;
}
async function tracks() { return (await api<{ tracks: StoredCustomTrack[] }>('/api/tracks')).tracks; }
async function publish(identity: Identity, name: string) {
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft); draft.name = name;
  return (await api<{ track: StoredCustomTrack }>('/api/tracks', 'POST', identity.token, { draft })).track;
}
async function newPage(identity: Identity, mobile = false): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser!.newContext({ viewport: mobile ? { width: 320, height: 568 } : { width: 1366, height: 900 },
    deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  // Session bootstrap is the same persisted bearer token used by the application.
  // The script never grants a permission through local storage or browser globals.
  await context.addInitScript(({ token, name, origin }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name);
    localStorage.setItem('lagon-volume', '0'); localStorage.setItem('lagon-graphics-quality', 'smooth');
  }, { token: identity.token, name: identity.profile.name, origin });
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#home-tab-play').waitFor();
  await until(async () => (await page.locator('[data-ranked-mmr]').innerText()) === '800 MMR', 'Authenticated profile restored');
  return { page, context };
}
async function editor(page: Page) {
  await (await homeControl(page, '#track-editor-button')).click();
  await page.locator('#track-editor-dialog').waitFor({ state: 'visible' });
  await until(async () => await page.locator('#editor-library [data-action="refresh"]').isEnabled(), 'Editor library loaded');
}
async function switchAccount(page: Page, username: string, password: string) {
  await page.locator('#editor-close').click();
  await (await homeControl(page, '[data-account="logout"]')).click();
  await (await homeControl(page, '[data-account="login"]')).click();
  await page.locator('#account-username').fill(username); await page.locator('#account-password').fill(password);
  await page.locator('#account-submit').click(); await page.locator('#account-dialog').waitFor({ state: 'hidden' });
  assert.match(await page.locator('#account-card').innerText(), new RegExp(username));
  await editor(page);
}
const removeButton = (page: Page, id: string) => page.locator(`[data-action="delete-track"][data-id="${id}"]`);
async function beginDelete(page: Page, track: StoredCustomTrack, touch = false) {
  if (touch) await removeButton(page, track.id).tap(); else await removeButton(page, track.id).click();
  await page.locator('#editor-delete-cancel').waitFor({ state: 'visible' });
  assert.match(await page.locator('#editor-confirm-text').innerText(), new RegExp(track.draft.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editor-delete-cancel', 'Safe Cancel is initially focused');
}
async function confirmDelete(page: Page, track: StoredCustomTrack, status = 200, touch = false) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === `/api/tracks/${track.id}` && response.request().method() === 'DELETE');
  if (touch) await page.locator('#editor-delete-confirm').tap(); else await page.locator('#editor-delete-confirm').click();
  const result = await response; assert.equal(result.status(), status);
  assert.deepEqual(result.request().postDataJSON(), { revision: track.revision }, 'Deletion confirms the displayed revision');
  if (status === 200) {
    assert.deepEqual(await result.json(), { deletedId: track.id });
    await page.locator('#editor-delete-confirm').waitFor({ state: 'hidden' });
    await until(async () => await page.locator(`[data-record-id="${track.id}"]`).count() === 0, 'Deleted circuit removed from library');
    assert.ok(!(await tracks()).some(value => value.id === track.id));
  } else {
    await page.locator('#editor-delete-error').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#editor-delete-error').innerText()).trim().length > 0, 'Readable error');
    assert.ok((await tracks()).some(value => value.id === track.id), 'Failed request must preserve circuit');
  }
}
async function capture(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Screenshot timed out')), 35_000); })]);
    await writeFile(join(output, name), Buffer.from(result.data, 'base64')); captures.push(name);
  } finally { clearTimeout(timer); await cdp.detach(); }
}
async function checkModalFits(page: Page, mobile = false) {
  const bounds = await page.locator('.editor-confirm[role="alertdialog"]').evaluate(node => {
    const box = node.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight,
      overflow: node.scrollWidth > node.clientWidth + 1 };
  });
  assert.ok(bounds.left >= -1 && bounds.top >= -1 && bounds.right <= bounds.width + 1 && bounds.bottom <= bounds.height + 1, JSON.stringify(bounds));
  assert.equal(bounds.overflow, false);
  for (const id of ['editor-delete-cancel', 'editor-delete-confirm']) {
    const box = await page.locator('#' + id).boundingBox(); assert.ok(box);
    assert.ok(box.y >= 0 && box.y + box.height <= bounds.height + 1);
    if (mobile) assert.ok(box.height >= 44, `${id} must retain a 44 px touch target`);
  }
}

try {
  evidence.assets = [...(await fetch(origin).then(response => response.text())).matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const alice = await api<Identity>('/api/account/register', 'POST', undefined, { username: 'AliceAtelier', password: 'demo-local-alice' });
  const bob = await api<Identity>('/api/account/register', 'POST', undefined, { username: 'BobAtelier', password: 'demo-local-bob' });
  const admin = await api<Identity>('/api/account/register', 'POST', undefined, { username: 'Admin', password: 'demo-local-admin' });
  const spoof = await api<Identity>('/api/profile', 'POST', undefined, { name: 'Admin' });
  assert.equal(admin.profile.canModerateTracks, true); assert.equal(Boolean(spoof.profile.canModerateTracks), false);
  assert.equal(Boolean(alice.profile.canModerateTracks), false);
  await api('/api/me', 'PATCH', admin.token, { name: 'Prof de la classe' });
  const bobTrack = await publish(bob, 'La forêt de Bob');
  const conflictTrack = await publish(alice, 'Versions de la classe');
  const rejectedTrack = await publish(alice, 'Circuit à conserver');
  for (const identity of [alice, spoof]) {
    const denial = await request(`/api/tracks/${bobTrack.id}`, 'DELETE', identity.token, { revision: bobTrack.revision });
    assert.equal(denial.status, 403); assert.ok((await tracks()).some(track => track.id === bobTrack.id));
  }
  record('Authenticated Admin permission is independent of display name; an ordinary author and a guest displayed as Admin receive HTTP 403 for somebody else’s circuit.');

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const desktop = await newPage(alice); const page = desktop.page;
  await editor(page);
  assert.equal(await removeButton(page, bobTrack.id).count(), 0, 'Another author has no Delete control');
  await page.locator('#editor-name').fill('Mon circuit à supprimer'); await page.locator('#editor-save').click();
  await until(async () => /Circuit publié/.test(await page.locator('#editor-status').innerText()), 'Published through editor');
  const owned = (await tracks()).find(track => track.draft.name === 'Mon circuit à supprimer'); assert.ok(owned?.runtimeId);
  await page.locator('#editor-close').click();
  await selectHomeTrack(page, owned.runtimeId, owned.draft.name);
  await editor(page); await page.locator('#editor-name').fill('Mon brouillon reste intact');
  await beginDelete(page, owned); await checkModalFits(page); await capture(page, 'owner-confirmation-desktop.png');
  for (let index = 0; index < 7; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.editor-confirm')), true, 'Modal Tab remains inside confirmation');
  }
  await page.keyboard.press('Escape'); await page.locator('#editor-delete-confirm').waitFor({ state: 'hidden' });
  assert.equal(await removeButton(page, owned.id).evaluate(node => node === document.activeElement), true, 'Cancel returns focus to Delete');
  assert.ok((await tracks()).some(track => track.id === owned.id));
  await beginDelete(page, owned);
  let releaseDelete!: () => void, deleteRequests = 0;
  const deleteGate = new Promise<void>(resolve => { releaseDelete = resolve; });
  await page.route(`**/api/tracks/${owned.id}`, async route => {
    if (route.request().method() === 'DELETE') { deleteRequests++; await deleteGate; }
    await route.continue();
  });
  const deletion = confirmDelete(page, owned); let pendingError: unknown;
  try {
    await until(async () => deleteRequests === 1, 'Actual DELETE held briefly');
    assert.equal(await page.locator('#editor-delete-confirm').isDisabled(), true);
    assert.equal(await page.locator('#editor-delete-cancel').isDisabled(), true);
    await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#editor-delete-confirm').isVisible(), true, 'Pending request keeps its confirmation visible');
    assert.equal(deleteRequests, 1, 'Repeated keyboard input cannot submit duplicate deletion');
  } catch (error) { pendingError = error; } finally { releaseDelete(); }
  await deletion; await page.unroute(`**/api/tracks/${owned.id}`);
  if (pendingError) throw pendingError;
  assert.equal(await page.locator('#editor-name').inputValue(), 'Mon brouillon reste intact');
  await page.locator('#editor-close').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('lagon-track')), 'lagon', 'Deleted active selection falls back to an official circuit');
  await openTrackCatalog(page); await page.locator('#track-picker-search').fill(owned.draft.name);
  assert.equal(await page.locator('#track-picker-cards [data-track]').count(), 0, 'Picker no longer offers deleted circuit');
  await page.locator('#track-picker-close').click();
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#home-tab-play').waitFor(); await editor(page);
  assert.equal(await page.locator('#editor-name').inputValue(), 'Mon brouillon reste intact');
  const republishedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/tracks' && response.request().method() === 'POST');
  await page.locator('#editor-save').click(); assert.equal((await republishedResponse).status(), 201);
  await until(async () => /Circuit publié/.test(await page.locator('#editor-status').innerText()), 'Detached draft republishes');
  const republished = (await tracks()).find(track => track.draft.name === 'Mon brouillon reste intact'); assert.ok(republished); assert.notEqual(republished.id, owned.id);
  record('Owner publishes and deletes from the UI; Escape cancels, keyboard focus stays in confirmation, catalogue/selection update immediately, and the preserved draft republishes with a new identity.');

  // A moderator on another client removes the currently previewed choice.
  await page.locator('#editor-close').click(); await openTrackCatalog(page);
  await api(`/api/tracks/${republished.id}`, 'DELETE', admin.token, { revision: republished.revision });
  await refreshHomeTracks(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('lagon-track')), 'lagon');
  assert.equal(await page.locator(`#track-picker-cards [data-track="${republished.runtimeId}"]`).count(), 0);
  await page.locator('#track-picker-confirm').click(); await editor(page);
  assert.equal(await page.locator('#editor-name').inputValue(), 'Mon brouillon reste intact');
  assert.match(await page.locator('#editor-save-state').innerText(), /Brouillon local/);
  record('A different client removes the selected circuit while the picker is open; Refresh removes its preview and restores an official choice, and reopening the editor preserves and detaches the local draft.');

  // A second actual client updates the record after this library displayed v1.
  const newer = (await api<{ track: StoredCustomTrack }>(`/api/tracks/${conflictTrack.id}`, 'PUT', alice.token,
    { revision: conflictTrack.revision, draft: { ...conflictTrack.draft, name: 'Versions de la classe v2' } })).track;
  await beginDelete(page, conflictTrack); await confirmDelete(page, conflictTrack, 409);
  assert.equal(await page.locator('#editor-name').inputValue(), 'Mon brouillon reste intact');
  assert.equal((await tracks()).find(track => track.id === conflictTrack.id)?.revision, newer.revision);
  await capture(page, 'revision-conflict-desktop.png');
  await page.locator('#editor-delete-cancel').click();
  await page.locator('#editor-library [data-action="refresh"]').click();
  await until(async () => (await page.locator(`[data-record-id="${newer.id}"]`).innerText()).includes('version 2'), 'Latest revision explicitly refreshed');
  await beginDelete(page, newer); await confirmDelete(page, newer);
  record('A real concurrent v2 update rejects confirmation of v1 with HTTP 409; the circuit and draft survive until an explicit refresh and a new confirmation.');

  await page.route(`**/api/tracks/${rejectedTrack.id}`, route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Suppression refusée : vos droits ont changé.' }) }) : route.continue());
  await beginDelete(page, rejectedTrack); await confirmDelete(page, rejectedTrack, 403);
  assert.equal(await page.locator('#editor-name').inputValue(), 'Mon brouillon reste intact');
  await page.locator('#editor-delete-cancel').click(); await page.unroute(`**/api/tracks/${rejectedTrack.id}`);
  // Expiring the actual session also tests the stale UI permission boundary.
  await beginDelete(page, rejectedTrack); await api('/api/account/logout', 'POST', alice.token);
  await confirmDelete(page, rejectedTrack, 401); await page.locator('#editor-delete-cancel').click();
  record('Simulated permission-change 403 and real expired-session 401 remain readable, preserve the drawing and circuit, and cannot execute a stale-authority deletion.');
  await desktop.context.close();

  const moderation = await newPage(admin); await editor(moderation.page);
  assert.equal(await moderation.page.locator('#name-input').inputValue(), 'Prof de la classe');
  assert.ok(await removeButton(moderation.page, bobTrack.id).count());
  await moderation.page.locator('#editor-name').fill('Projet personnel du professeur');
  await switchAccount(moderation.page, 'BobAtelier', 'demo-local-bob');
  assert.equal(await moderation.page.locator('#editor-name').inputValue(), CUSTOM_TRACK_TEMPLATES[0]!.draft.name, 'Bob must not inherit the Admin drawing');
  assert.equal(await moderation.page.locator('.editor-moderation-note').count(), 0);
  assert.equal(await removeButton(moderation.page, rejectedTrack.id).count(), 0, 'Admin controls disappear after account change');
  await moderation.page.locator('#editor-name').fill('Brouillon personnel de Bob');
  await switchAccount(moderation.page, 'Admin', 'demo-local-admin');
  assert.equal(await moderation.page.locator('#editor-name').inputValue(), 'Projet personnel du professeur');
  assert.equal(await moderation.page.locator('.editor-moderation-note').count(), 1);
  assert.equal(await removeButton(moderation.page, rejectedTrack.id).count(), 1);
  record('Real logout/login on the same page removes Admin controls for Bob and restores them for Admin; both accounts keep independent local drawings.');
  await beginDelete(moderation.page, bobTrack); await checkModalFits(moderation.page);
  assert.match(await moderation.page.locator('#editor-confirm-text').innerText(), /BobAtelier/);
  await capture(moderation.page, 'admin-confirmation-desktop.png');
  await confirmDelete(moderation.page, bobTrack);
  assert.equal(await moderation.page.locator('#editor-name').inputValue(), 'Projet personnel du professeur');
  assert.equal((await request(`/api/tracks/${bobTrack.runtimeId}`)).status, 200, 'Historical revision remains readable for existing races/replays');
  record('The authenticated Admin account, displayed as Prof de la classe, removes Bob’s circuit with explicit name/author confirmation while preserving its own draft and the historical revision.');
  await moderation.context.close();

  const aliceRestored = await api<Identity>('/api/account/login', 'POST', undefined, { username: 'AliceAtelier', password: 'demo-local-alice' });
  const mobileTrack = await publish(aliceRestored, 'Les très longues routes de la classe à supprimer');
  const mobile = await newPage(aliceRestored, true); await editor(mobile.page);
  await beginDelete(mobile.page, mobileTrack, true); await checkModalFits(mobile.page, true);
  await capture(mobile.page, 'owner-confirmation-mobile-320.png');
  await mobile.page.locator('#editor-delete-cancel').tap();
  assert.ok((await tracks()).some(track => track.id === mobileTrack.id));
  await beginDelete(mobile.page, mobileTrack, true); await confirmDelete(mobile.page, mobileTrack, 200, true);
  assert.equal(await mobile.page.locator('#track-editor-dialog').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
  await capture(mobile.page, 'owner-deleted-mobile-320.png');
  record('Mobile 320×568: a long circuit name fits the confirmation, both actions stay visible with 44 px targets, touch Cancel preserves the circuit and touch Delete removes it without horizontal overflow.');
  await mobile.context.close();
  assert.deepEqual(errors, []);
  evidence.remainingCircuitNames = (await tracks()).map(track => track.draft.name);
  await rm(join(output, 'failure.png'), { force: true });
  await writeFile(join(output, 'browser-validation.json'), JSON.stringify({ passed: true, timestamp: new Date().toISOString(), checks, captures, errors, evidence }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, captures }, null, 2));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await capture(currentPage, 'failure.png').catch(() => {});
  await writeFile(join(output, 'browser-validation.json'), JSON.stringify({ passed: false, checks, captures, errors, evidence, failure: String(error) }, null, 2) + '\n');
  process.exitCode = 1; throw error;
} finally {
  await browser?.close(); await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
}
