import { homeControl, selectHomeTrack, refreshHomeTracks } from './menu-navigation.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import type { StoredCustomTrack } from '../shared/custom-tracks.js';
import type { World } from '../shared/game.js';

// Explicit public smoke check. Publishes one useful circuit through the actual UI;
// VERIFY_ONLY=1 merely re-reads it after a container recreation, without new profiles.
const origin = (process.env.BASE_URL ?? 'https://miles-blades-tulsa-citizens.trycloudflare.com').replace(/\/$/, '');
assert.match(origin, /^https:\/\//, 'Use the public HTTPS origin explicitly.');
const destination = resolve('docs/editor/public'); await mkdir(destination, { recursive: true });
const reportPath = join(destination, 'browser-validation.json');
const recoveryPath = '/tmp/lagon-editor-public-browser-state.json';
const title = 'La boucle de l’atelier';
const checks: string[] = [], captures: string[] = [], errors: string[] = [];
const evidence: Record<string, unknown> = { origin, inputMethod: 'Formulaires, souris et clavier ordinaires ; diagnostics en lecture seule.' };
const pages: Page[] = [];
let browser: Browser | undefined;
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function get<T>(path: string): Promise<T> {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, `HTTP ${path}`);
  return await response.json() as T;
}
async function until(predicate: () => Promise<boolean>, label: string, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label);
    await pause(150);
  }
}
type Diagnostics = { world: World | null; sessionId: string | null; connected: boolean;
  view: { calls: number; triangles: number; tracked: { id: string } | null };
  kartAssets: { fallbackCount: number; models: Record<string, { status: string; loadCount: number }> } };
async function state(page: Page): Promise<Diagnostics> {
  return await page.evaluate(() => (window as unknown as { __lagonDebug: Diagnostics }).__lagonDebug);
}
async function ready(page: Page, index: number) {
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => errors.push(`Navigateur ${index}: ${error.message}`));
  const isAsset = (url: string) => /\/(assets|models|audio|scenery|textures)\//.test(new URL(url).pathname);
  page.on('response', response => {
    if (isAsset(response.url()) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText;
    if (isAsset(request.url()) && failure !== 'net::ERR_ABORTED') errors.push(`Ressource ${new URL(request.url()).pathname}: ${failure}`);
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug, undefined, { timeout: 60_000 });
}
async function capture(page: Page, filename: string) {
  await page.screenshot({ path: join(destination, filename) }); captures.push(filename);
}
async function leave(page: Page) {
  if ((await state(page).catch(() => undefined))?.world) {
    await page.keyboard.up('ArrowUp'); await page.locator('#leave-button').click({ timeout: 10_000 });
    await until(async () => (await state(page)).world === null, 'sortie du salon', 20_000);
  }
}

try {
  const health = await get<{ status: string; rooms: number }>('/healthz');
  assert.equal(health.rooms, 0, 'Le contrôle commence sans salon occupé.'); evidence.healthBefore = health;
  if (process.env.VERIFY_ONLY === '1') {
    const before = JSON.parse(await readFile(reportPath, 'utf8')) as { passed: boolean; evidence: { savedTrack: StoredCustomTrack; draftSha256: string } };
    assert.equal(before.passed, true, 'Une publication UI validée doit précéder la vérification de persistance.');
    const expected = before.evidence.savedTrack;
    const current = (await get<{ tracks: StoredCustomTrack[] }>('/api/tracks')).tracks.find(track => track.id === expected.id);
    assert.ok(current); assert.deepEqual(current, expected);
    assert.equal(digest(current.draft), before.evidence.draftSha256);
    const exact = await get<{ track: StoredCustomTrack }>(`/api/tracks/${expected.id}-v${expected.revision}`);
    assert.deepEqual(exact.track, expected);
    record('Après redémarrage : même circuit, même révision, même propriétaire et même géométrie relus depuis le tunnel public.');
    await writeFile(join(destination, 'persistence-validation.json'), JSON.stringify({ passed: true, at: new Date().toISOString(),
      origin, checks, health, trackId: expected.id, revision: expected.revision, draftSha256: digest(current.draft),
      scope: 'Lecture HTTP seule après redémarrage ; aucun nouveau compte, circuit ou salon créé.' }, null, 2) + '\n');
  } else {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    // A failed run can resume the same test guest and circuit instead of publishing duplicates.
    const recovery = await readFile(recoveryPath, 'utf8').then(value => JSON.parse(value)).catch(() => undefined);
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
      ...(recovery ? { storageState: recovery } : {}) });
    const secondContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const host = await desktop.newPage(), guest = await secondContext.newPage(); pages.push(host, guest);
    await ready(host, 1);
    evidence.clientAssets = await host.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')));
    await (await homeControl(host, '#name-input')).fill('Atelier circuits');
    await (await homeControl(host, '#track-editor-button')).click(); await host.locator('#track-editor-dialog').waitFor({ state: 'visible' });
    await writeFile(recoveryPath, JSON.stringify(await desktop.storageState()), { mode: 0o600 });
    let saved = (await get<{ tracks: StoredCustomTrack[] }>('/api/tracks')).tracks.find(track => track.draft.name === title);
    if (!saved) {
      await host.locator('#editor-name').fill(title); await host.locator('#editor-theme').selectOption('forest');
      await host.locator('#editor-canvas').scrollIntoViewIfNeeded();
      const point = await host.locator('#editor-canvas [data-point="2"] circle').first().evaluate(circle => {
        const svg = circle.closest('svg')!;
        const p = new DOMPoint(Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))).matrixTransform(svg.getScreenCTM()!);
        return { x: p.x, y: p.y };
      });
      await host.mouse.move(point.x, point.y); await host.mouse.down();
      await host.mouse.move(point.x + 12, point.y + 3, { steps: 6 }); await host.mouse.up();
      await host.locator('#editor-add-zone').click();
      await host.locator('[data-zone="1"][data-field="kind"]').selectOption('mud');
      await host.locator('[data-zone="1"][data-field="start"]').fill('52');
      await host.locator('[data-zone="1"][data-field="start"]').press('Tab');
      await host.locator('[data-zone="1"][data-field="lane"]').selectOption('1');
      await until(async () => /prête à rouler/.test(await host.locator('#editor-validation').innerText()), 'circuit valide dans l’éditeur');
      await host.locator('#editor-save').click();
      await until(async () => /Circuit sauvegardé/.test(await host.locator('#editor-status').innerText()), 'sauvegarde UI publique');
      saved = (await get<{ tracks: StoredCustomTrack[] }>('/api/tracks')).tracks.find(track => track.draft.name === title);
      assert.ok(saved); assert.equal(saved.revision, 1); assert.equal(saved.draft.theme, 'forest'); assert.equal(saved.draft.zones.length, 2);
      record('Un circuit utile créé par l’interface : boucle large, point déplacé à la souris, forêt, bande turbo et boue latérale ; sauvegarde confirmée par l’API publique.');
    } else {
      const open = host.locator(`[data-action="open"][data-id="${saved.id}"]`);
      await open.waitFor(); await open.click();
      if (await host.locator('[data-action="pending-confirm"]').isVisible()) await host.locator('[data-action="pending-confirm"]').click();
      assert.equal(await host.locator('#editor-name').inputValue(), title);
      record('Circuit de ce contrôle retrouvé après une tentative antérieure ; réutilisation sans doublon ni nouvelle révision.');
    }
    const runtimeId = `${saved.id}-v${saved.revision}`;
    evidence.savedTrack = saved; evidence.draftSha256 = digest(saved.draft);
    await writeFile(recoveryPath, JSON.stringify(await desktop.storageState()), { mode: 0o600 });
    assert.deepEqual((await get<{ track: StoredCustomTrack }>(`/api/tracks/${runtimeId}`)).track, saved);
    await host.locator('#editor-canvas').scrollIntoViewIfNeeded(); await capture(host, 'editor-published.png');
    await host.locator('#editor-close').click(); await host.locator('#track-editor-dialog').waitFor({ state: 'hidden' });
    await selectHomeTrack(host, runtimeId, title);

    await ready(guest, 2);
    assert.equal(await guest.evaluate(() => localStorage.getItem('lagon-player-token')), null, 'Le deuxième contexte commence sans identité partagée.');
    await (await homeControl(guest, '#name-input')).fill('Pilote invité');
    await refreshHomeTracks(guest); await selectHomeTrack(guest, runtimeId, title);
    assert.equal(await guest.locator('#track-name').innerText(), title);
    await capture(guest, 'community-circuit.png');
    record('Un second navigateur vierge découvre le circuit publié dans la bibliothèque et le sélectionne depuis l’accueil.');

    await (await homeControl(host, '#create-button')).click();
    await until(async () => (await state(host)).world?.phase === 'lobby', 'salon public créé');
    const roomId = new URL(await host.locator('#share-url').inputValue()).pathname.split('/').pop()!;
    await (await homeControl(guest, '#code-input')).fill(roomId); await (await homeControl(guest, '#join-button')).click();
    await until(async () => (await Promise.all(pages.map(state))).every(view => view.world?.trackId === runtimeId && view.world.players.length === 2), 'deux clients sur le circuit publié');
    for (const page of pages) await page.locator('#ready-button').click();
    await until(async () => (await state(host)).world!.players.every(kart => kart.ready), 'deux joueurs prêts');
    await host.locator('#start-button').click();
    await until(async () => (await Promise.all(pages.map(state))).every(view => view.world?.phase === 'racing'), 'départ réel via le tunnel');
    const before = (await state(host)).world!.players.map(kart => ({ id: kart.id, x: kart.x, z: kart.z }));
    for (const page of pages) await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await Promise.all(pages.map(page => page.keyboard.down('ArrowUp')));
    // Read-only diagnostics never set position, speed, laps or controls.
    await until(async () => (await state(host)).world!.players.every(kart => {
      const start = before.find(position => position.id === kart.id)!;
      return kart.lastSeq > 0 && Math.hypot(kart.x - start.x, kart.z - start.z) > 3;
    }), 'déplacement des deux joueurs par leurs touches', 45_000);
    await Promise.all(pages.map(page => page.keyboard.up('ArrowUp')));
    const after = await state(host);
    evidence.driving = after.world!.players.map(kart => {
      const start = before.find(position => position.id === kart.id)!;
      return { id: kart.id, distance: Math.hypot(kart.x - start.x, kart.z - start.z), inputSequence: kart.lastSeq, trackId: kart.trackId };
    });
    for (const page of pages) {
      const view = await state(page);
      assert.equal(view.world!.trackId, runtimeId); assert.equal(view.kartAssets.fallbackCount, 0);
      assert.ok(view.view.calls > 0 && view.view.triangles > 0 && view.view.tracked);
      assert.equal(view.world!.players.length, 2);
    }
    await capture(host, 'race-custom-track.png'); await capture(guest, 'race-second-player.png');
    record('Deux joueurs partagent un vrai salon et avancent avec le clavier sur le circuit créé ; rendu 3D actif sans kart de secours.');
    for (const page of pages) await leave(page);
    await until(async () => (await get<{ rooms: number }>('/healthz')).rooms === 0, 'salon de test libéré', 30_000);
    evidence.healthAfter = await get('/healthz'); assert.deepEqual(errors, []);
    record('Aucune erreur JavaScript ni ressource manquante détectée ; sortie propre des deux joueurs et zéro salon restant.');
    await writeFile(reportPath, JSON.stringify({ passed: true, at: new Date().toISOString(), origin, checks, captures, errors, evidence,
      scope: 'Serveur Docker public à travers le tunnel HTTPS/WSS ; deux contextes Chromium indépendants. Un circuit conservé dans data/tracks et deux profils invités ordinaires. Départ et déplacement réels, aucune course complète ni téléphone physique dans ce contrôle.' }, null, 2) + '\n');
    await rm(recoveryPath, { force: true });
    console.log(JSON.stringify({ passed: true, checks: checks.length, circuit: title, runtimeId, captures }));
  }
} catch (error) {
  process.exitCode = 1;
  if (process.env.VERIFY_ONLY !== '1') {
    for (const [index, page] of pages.entries()) await capture(page, `failure-client-${index + 1}.png`).catch(() => {});
    await writeFile(reportPath, JSON.stringify({ passed: false, at: new Date().toISOString(), origin, checks, captures, errors, evidence,
      failure: error instanceof Error ? error.message : String(error) }, null, 2) + '\n');
  }
  throw error;
} finally {
  for (const page of pages) await leave(page).catch(() => {});
  await browser?.close();
}
