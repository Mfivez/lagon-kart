/** Home/navigation checks against a private server and disposable data only.
 * The catalogue stress fixture is created through its ordinary authenticated API.
 * No public account, ranking, room or circuit is modified by this scenario. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser, type Page } from 'playwright';
import { CUSTOM_TRACK_TEMPLATES, CUSTOM_TRACK_THEMES, type StoredCustomTrack } from '../shared/custom-tracks.js';
import type { PlayerProfile } from '../shared/progression.js';
import type { World } from '../shared/game.js';

const output = resolve(process.env.REPORT_DIR ?? 'docs/home-navigation');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-home-navigation-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players');
process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { createGameServer } = await import('../server/app.js');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client'));
await ready; await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const checks: string[] = [], errors: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = { origin, startedAt: new Date().toISOString(), checks, errors, captures,
  scope: 'Chromium desktop and touch emulation, built client and real private server; temporary profiles and 32 authored tracks created through HTTP APIs.',
  limitations: ['No physical phone or Safari iOS tested.', 'These checks cover home navigation and normal room creation, not a complete race.'] };
let browser: Browser | undefined;
let activePage: Page | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, label: string, timeout = 30_000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > end) throw new Error(label); await pause(100); }
}
async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok(response.ok, `${path} returned ${response.status}: ${response.ok ? '' : await response.text()}`);
  return response.json() as Promise<T>;
}
function record(value: string) { checks.push(value); console.log('✓ ' + value); }
async function capture(page: Page, filename: string) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const data = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false });
    await writeFile(join(output, filename), Buffer.from(data.data, 'base64')); captures.push(filename);
  } finally { await cdp.detach(); }
}
async function visibleWithoutScroll(page: Page, selector: string) {
  const result = await page.locator(selector).evaluate(node => {
    const r = node.getBoundingClientRect();
    let visible = r.width > 0 && r.height > 0 && r.x >= -1 && r.y >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    // The zero-height body contains fixed-position children and does not clip them.
    for (let ancestor = node.parentElement; ancestor && ancestor.tagName !== 'BODY'; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) visible &&= r.y >= a.y - 1 && r.bottom <= a.bottom + 1;
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) visible &&= r.x >= a.x - 1 && r.right <= a.right + 1;
    }
    const center = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { visible, unobstructed: !!center && (node.contains(center) || center.contains(node)), box: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  assert.ok(result.visible, `${selector} must fit without scrolling: ${JSON.stringify(result.box)}`);
  assert.ok(result.unobstructed, `${selector} must not be covered by another panel`);
  return result.box;
}
async function noHorizontalOverflow(page: Page, selector: string) {
  const dimensions = await page.locator(selector).evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
  assert.ok(dimensions.scroll <= dimensions.client + 1, `${selector} horizontal overflow: ${JSON.stringify(dimensions)}`);
}
async function state(page: Page) {
  return page.evaluate(() => (window as unknown as { __lagonDebug: { world: World | null } }).__lagonDebug.world);
}
async function picked(page: Page) { return page.evaluate(() => localStorage.getItem('lagon-track') ?? 'lagon'); }
async function pickerFits(page: Page) {
  await visibleWithoutScroll(page, '#track-picker-close');
  await visibleWithoutScroll(page, '#track-picker-search');
  await visibleWithoutScroll(page, '#track-picker-source');
  await visibleWithoutScroll(page, '#track-picker-confirm');
  await visibleWithoutScroll(page, '#track-picker-next');
  await visibleWithoutScroll(page, '#track-picker-detail h3');
  await noHorizontalOverflow(page, '#track-picker');
  const cards = page.locator('#track-picker-cards [data-track]');
  for (let index = 0; index < await cards.count(); index++) {
    await visibleWithoutScroll(page, `#track-picker-cards [data-track]:nth-child(${index + 1})`);
  }
}
async function testPicker(page: Page, touch = false) {
  const activate = async (selector: string) => touch ? page.locator(selector).tap() : page.locator(selector).click();
  const original = await picked(page);
  await activate('#choose-track-button'); await page.locator('#track-picker').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'track-picker-close', 'Opening the picker must not open the phone keyboard');
  await pickerFits(page);
  await page.locator('#track-picker-source').selectOption('community');
  assert.match(await page.locator('#track-picker-page').innerText(), /32 circuits/);
  const firstPage = await page.locator('#track-picker-cards [data-track]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-track')));
  await activate('#track-picker-next');
  assert.notDeepEqual(await page.locator('#track-picker-cards [data-track]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-track'))), firstPage);
  await page.locator('#track-picker-search').fill('epreuve 31');
  assert.equal(await page.locator('#track-picker-cards [data-track]').count(), 1, 'Search must ignore accents and use every term');
  const proposed = await page.locator('#track-picker-cards [data-track]').getAttribute('data-track'); assert.ok(proposed?.startsWith('custom-'));
  await activate('#track-picker-cards [data-track]');
  assert.equal(await picked(page), original, 'Preview must not silently commit a circuit');
  assert.match(await page.locator('#track-picker-detail h3').innerText(), /Épreuve 31/);
  await pickerFits(page);
  await capture(page, touch ? 'picker-mobile-long-name.png' : 'picker-desktop-long-name.png');
  if (touch) await activate('#track-picker-close'); else await page.keyboard.press('Escape');
  await page.locator('#track-picker').waitFor({ state: 'hidden' });
  assert.equal(await picked(page), original, 'Cancel keeps the previous circuit');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'choose-track-button', 'Picker restores keyboard focus');

  await activate('#choose-track-button');
  await page.locator('#track-picker-search').fill('epreuve 31'); await activate('#track-picker-cards [data-track]');
  await activate('#track-picker-confirm'); await page.locator('#track-picker').waitFor({ state: 'hidden' });
  assert.equal(await picked(page), proposed);
  assert.match(await page.locator('#track-name').innerText(), /Épreuve 31/);
  await activate('#choose-track-button');
  assert.equal(await page.locator('#track-picker-cards [aria-pressed="true"]').getAttribute('data-track'), proposed);
  await page.locator('#track-picker-source').selectOption('official');
  assert.ok((await page.locator('#track-picker-cards [data-track]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-track')))).every(id => !id?.startsWith('custom-')));
  await page.locator('#track-picker-search').fill('aucun-circuit-de-ce-nom-2026');
  assert.equal(await page.locator('#track-picker-cards [data-track]').count(), 0);
  await activate('#track-picker-cards [data-clear-search]');
  assert.ok(await page.locator('#track-picker-cards [data-track]').count() > 0);
  await page.route('**/api/tracks', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Panne simulée uniquement pour cette page de test' }) }));
  await activate('#track-refresh-button');
  await until(async () => (await page.locator('#track-picker-status').innerText()).includes('indisponibles'), 'Refresh error must remain readable');
  assert.equal(await picked(page), proposed); await pickerFits(page);
  await page.unroute('**/api/tracks'); await activate('#track-refresh-button');
  await until(async () => !(await page.locator('#track-refresh-button').isDisabled()) && (await page.locator('#track-picker-status').innerText()) === '', 'Refresh retries and clears its error');
  assert.equal(await picked(page), proposed);
  if (!touch) {
    for (let index = 0; index < 18; index++) {
      await page.keyboard.press('Tab');
      // Native dialogs may yield focus to browser chrome (activeElement BODY).
      // The page's background controls must stay unreachable while it is modal.
      assert.equal(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('#track-picker')), true, 'Tab must not reach a background control');
    }
  }
  await activate('#track-picker-close');
  record(`${touch ? 'Touch' : 'Keyboard/mouse'} picker: 32 long-name creations, pagination, accent-insensitive search, source filters, empty state, explicit confirm/cancel, focus return and failed refresh/retry preserving selection.`);
}
async function testSlowCatalogue(page: Page) {
  await page.locator('#choose-track-button').click(); await page.locator('#track-picker-search').fill('alizes');
  await page.locator('#track-picker-cards [data-track="lagon"]').click(); await page.locator('#track-picker-confirm').click();
  for (const startBeforeRelease of [false, true]) {
    let release!: () => void, received = false, released = false;
    const held = new Promise<void>(resolve => { release = () => { released = true; resolve(); }; });
    await page.route('**/api/tracks', async route => { received = true; await held; await route.continue(); });
    try {
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#home-tab-play').waitFor();
      await until(async () => received, 'Catalogue request retained');
      if (!startBeforeRelease) {
        await page.locator('#choose-track-button').click(); await page.locator('#track-picker-search').fill('canyon');
        await page.locator('#track-picker-cards [data-track="canyon"]').click(); await page.locator('#track-picker-confirm').click();
        assert.equal(await picked(page), 'canyon'); assert.equal(released, false);
        release();
        await page.locator('#choose-track-button').click(); await page.locator('#track-picker-source').selectOption('community');
        await until(async () => (await page.locator('#track-picker-page').innerText()).includes('32 circuits'), 'Delayed catalogue eventually installs creations');
        await page.locator('#track-picker-close').click();
        assert.equal(await picked(page), 'canyon'); assert.match(await page.locator('#track-name').innerText(), /Canyon/);
        record('A delayed catalogue response preserves the official circuit explicitly chosen while the request is pending.');
      } else {
        await page.locator('#create-button').click(); await until(async () => (await state(page))?.phase === 'lobby', 'Official room must open while catalogue is still pending', 15_000);
        assert.equal(released, false); assert.equal((await state(page))?.trackId, 'canyon');
        release(); await page.locator('#leave-button').click(); await until(async () => !(await state(page)), 'Return after pending-catalogue room');
        record('An official normal room opens before its retained catalogue request is released; community loading does not block Play.');
      }
    } finally { release(); await page.unroute('**/api/tracks'); }
  }
}
async function testReducedViewport(page: Page) {
  await page.setViewportSize({ width: 320, height: 568 }); await pause(150);
  await page.locator('#choose-track-button').tap();
  await page.setViewportSize({ width: 320, height: 260 });
  await until(async () => await page.locator('html').getAttribute('data-menu-viewport-short') === 'true', 'Short visible viewport detected');
  await page.locator('#track-picker-search').fill('epreuve 31');
  assert.equal(await page.locator('#track-picker-cards [data-track]').count(), 1);
  await visibleWithoutScroll(page, '#track-picker-close');
  await visibleWithoutScroll(page, '#track-picker-confirm');
  await noHorizontalOverflow(page, '#track-picker');
  const scrollers = await page.locator('#track-picker').evaluate(root => [root, ...root.querySelectorAll('*')].filter(node => {
    const style = getComputedStyle(node); return /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
  }).map(node => node.id || node.className));
  assert.deepEqual(scrollers, ['track-picker'], 'The short viewport uses only one fallback scrolling region');
  evidence.reducedViewport = { width: 320, height: 260, scrollers, systemKeyboard: false };
  await capture(page, 'picker-reduced-320x260.png');
  await page.locator('#track-picker-confirm').tap(); await page.locator('#track-picker').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 568, height: 320 }); await pause(150);
  record('Reduced 320×260 viewport: search works, Close/Choose remain exposed and operable, one fallback scroll region. This simulates reduced space, not an Android/iOS keyboard.');
}

try {
  const html = await fetch(origin).then(response => response.text());
  evidence.assets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const identities: Array<{ token: string; profile: PlayerProfile }> = [];
  for (let index = 0; index < 2; index++) identities.push(await api('/api/profile', undefined, { name: `Pilote accueil ${index + 1}` }));
  const authored: StoredCustomTrack[] = [];
  for (let index = 0; index < 32; index++) {
    const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
    draft.name = `Épreuve ${String(index + 1).padStart(2, '0')} — Les très longues routes de la classe`.slice(0, 48);
    draft.theme = CUSTOM_TRACK_THEMES[index % CUSTOM_TRACK_THEMES.length]!.id;
    draft.lapCount = 1 + index % 12;
    authored.push((await api<{ track: StoredCustomTrack }>('/api/tracks', identities[Math.floor(index / 16)]!.token, { draft })).track);
  }
  assert.equal((await api<{ tracks: StoredCustomTrack[] }>('/api/tracks')).tracks.length, 32);
  evidence.catalogueFixture = { authored: authored.length, nameLengths: [...new Set(authored.map(track => track.draft.name.length))], themes: CUSTOM_TRACK_THEMES.length };
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });

  const layouts: unknown[] = []; evidence.layouts = layouts;
  const essentials = ['#name-input', '#home-ranked-action', '[data-ranked-grade]', '[data-ranked-mmr]', '#create-button', '#practice-button', '#code-input', '#join-button', '#choose-track-button', '#track-name', '#track-tags', '.home-presence-summary', '#home-tab-play', '#home-tab-pilot', '#home-tab-online', '#home-tab-options'];
  const modes = process.env.VIEWPORT_MODE === 'mobile' ? [true] : process.env.VIEWPORT_MODE === 'desktop' ? [false] : [false, true];
  evidence.viewportMode = process.env.VIEWPORT_MODE ?? 'all';
  for (const touch of modes) {
    const sizes = touch ? [[320, 568], [390, 844], [568, 320]] : [[1827, 860], [1366, 768], [1024, 768]];
    const context = await browser.newContext({ viewport: { width: sizes[0]![0]!, height: sizes[0]![1]! }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
    const identity = identities[touch ? 1 : 0]!;
    await context.addInitScript(({ token, name, origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name);
      localStorage.setItem('lagon-volume', '0'); localStorage.setItem('lagon-graphics-quality', 'smooth');
    }, { token: identity.token, name: identity.profile.name, origin });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(30_000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.locator('#home-tab-play').waitFor();
    await until(async () => (await page.locator('[data-ranked-mmr]').innerText()) === '800 MMR', 'Saved server MMR restored');
    await until(async () => (await page.locator('[data-home-online-summary]').innerText()).includes('connecté'), 'Live presence summary');
    for (const [index, [width, height]] of sizes.entries()) {
      await page.setViewportSize({ width: width!, height: height! }); await pause(250);
      await page.locator('#home-tab-play').click();
      const boxes: Record<string, unknown> = {};
      for (const selector of essentials) boxes[selector] = await visibleWithoutScroll(page, selector);
      await noHorizontalOverflow(page, '#home-panel'); await noHorizontalOverflow(page, '#home-view-play');
      assert.equal(await page.locator('.home-hub-body').evaluate(node => node.scrollHeight > node.clientHeight + 1), false, `Primary home screen must not scroll at ${width}×${height}`);
      assert.equal(await page.locator('.home-hub-body').evaluate(node => node.scrollTop), 0);
      const label = `${width}x${height}`; layouts.push({ width, height, touch, selected: await picked(page), boxes });
      await capture(page, `home-${label}.png`);
      await page.locator('#choose-track-button').click(); await pickerFits(page); await capture(page, `picker-${label}.png`);
      await page.locator('#track-picker-close').click();
      if (index === 0) await testPicker(page, touch);
      // The long authored name selected above must also leave game actions visible.
      for (const selector of essentials) await visibleWithoutScroll(page, selector);
      assert.equal(await page.locator('.home-hub-body').evaluate(node => node.scrollHeight > node.clientHeight + 1), false, `Long circuit name must not introduce primary scroll at ${label}`);
      for (const view of ['pilot', 'online', 'options']) {
        const tab = page.locator(`#home-tab-${view}`); if (touch) await tab.tap(); else await tab.click();
        assert.equal(await tab.getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator(`#home-view-${view}`).isVisible(), true);
        assert.equal(await page.locator('#home-view-play').evaluate(node => (node as HTMLElement).inert), true);
        await noHorizontalOverflow(page, '#home-panel'); await noHorizontalOverflow(page, `.home-hub-body`);
        for (const other of ['play', 'pilot', 'online', 'options']) await visibleWithoutScroll(page, `#home-tab-${other}`);
      }
      assert.equal(await page.locator('#home-settings-controls #graphics-quality').count(), 1);
      await page.locator('#graphics-quality').selectOption('smooth');
      assert.equal(await page.evaluate(() => localStorage.getItem('lagon-graphics-quality')), 'smooth');
      await page.locator('#home-tab-play').click();
      assert.match(await page.locator('#track-name').innerText(), /Épreuve 31/);
      record(`${label}: core actions, rank/MMR, chosen circuit, presence and navigation visible without scrolling; secondary views reachable with no horizontal overflow.`);
    }
    if (touch) await testReducedViewport(page);
    await page.locator('#home-tab-play').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'home-tab-pilot');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'home-view-pilot', 'Tab enters the selected panel rather than a hidden view');
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'home-tab-pilot');
    await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'home-tab-options');
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'home-tab-play');
    const selected = await picked(page);
    await page.locator('#create-button').click(); await until(async () => (await state(page))?.phase === 'lobby', 'Normal room opens');
    assert.equal((await state(page))?.trackId, selected); assert.equal((await state(page))?.practice, false);
    assert.equal(await page.locator('.bottom-bar #graphics-quality').count(), 1, 'Settings return to the race/lobby footer');
    await page.locator('#leave-button').click(); await until(async () => !(await state(page)), 'Return from room');
    assert.equal(await page.locator('#home-settings-controls #graphics-quality').count(), 1, 'Returning home restores unique settings controls');
    assert.equal(await picked(page), selected); assert.equal(await page.locator('#home-tab-play').getAttribute('aria-selected'), 'true');
    record(`${touch ? 'Mobile' : 'Desktop'}: keyboard tab navigation, selected custom circuit used by a real normal room, leave returns to Play with settings and selection intact.`);
    if (!touch) await testSlowCatalogue(page);
    await context.close();
  }
  await until(async () => (await api<{ rooms: number }>('/healthz')).rooms === 0, 'All private rooms disposed');
  assert.deepEqual(errors, []); evidence.passed = true;
} catch (error) {
  evidence.passed = false; evidence.error = String(error); process.exitCode = 1; console.error(error);
  if (activePage && !activePage.isClosed()) {
    await capture(activePage, 'failure.png').catch(() => {});
    evidence.failureLayout = await activePage.evaluate(() => [...document.querySelectorAll('#home-panel, .home-hub-body, #home-view-play, #home-ranked, #track-picker, #track-picker-cards, #track-picker-detail, #track-picker-confirm')].map(node => {
      const box = node.getBoundingClientRect(); return { id: node.id || node.className, box: { x: box.x, y: box.y, width: box.width, height: box.height }, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
    })).catch(() => null);
  }
}
finally {
  await browser?.close(); await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
  evidence.finishedAt = new Date().toISOString(); evidence.browserClosed = true; evidence.temporaryDataRemoved = true;
  await writeFile(join(output, 'browser-validation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, checks: checks.length, captures }));
}
