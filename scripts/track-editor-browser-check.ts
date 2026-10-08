import { homeControl } from './menu-navigation.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { StoredCustomTrack } from '../shared/custom-tracks.js';
import type { World } from '../shared/game.js';

// Uses the actual application through HTTP and its normal guest/profile flow.
// Run against a private server/store; it intentionally publishes two test tracks.
const origin = (process.env.BASE_URL ?? 'http://127.0.0.1:3005').replace(/\/$/, '');
const destination = resolve(process.env.REPORT_DIR ?? 'docs/editor'); await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const checks: string[] = [], captures: string[] = [], errors: string[] = [];
const evidence: Record<string, unknown> = { origin, inputMethod: 'Actions souris, clavier et tactile Chromium ; aucune modification directe du circuit ou de la simulation.' };
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, label: string, ms = 40000) {
  const end = Date.now() + ms;
  while (!await predicate()) { if (Date.now() > end) throw Error(label); await pause(100); }
}
async function ready(page: Page) {
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
}
async function capture(page: Page, name: string) {
  // Capture the real viewport: the paused canvas beneath an opaque editor can
  // leave Playwright's compositor screenshot waiting under SwiftShader.
  const cdp = await page.context().newCDPSession(page); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('Capture viewport : délai de 35 s dépassé')), 35000); })]);
    await writeFile(join(destination, name), Buffer.from(result.data, 'base64')); captures.push(name);
  } finally { clearTimeout(timer); await cdp.detach(); }
}
async function pointPosition(page: Page, index: number) {
  return page.locator(`#editor-canvas [data-point="${index}"] circle`).first().evaluate(circle => {
    const svg = circle.closest('svg')!; const point = new DOMPoint(Number(circle.getAttribute('cx')), Number(circle.getAttribute('cy'))).matrixTransform(svg.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
}
async function drag(page: Page, index: number, dx: number, dy: number) {
  await page.locator('#editor-canvas').scrollIntoViewIfNeeded(); const point = await pointPosition(page, index);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + dx, point.y + dy, { steps: 8 }); await page.mouse.up(); await pause(200);
}
async function allTracks(): Promise<StoredCustomTrack[]> { return (await fetch(`${origin}/api/tracks`).then(response => response.json()) as { tracks: StoredCustomTrack[] }).tracks; }
async function save(page: Page) {
  await page.locator('#editor-save').click();
  await until(async () => /Circuit publié/.test(await page.locator('#editor-status').innerText()), 'Publication explicite visible attendue');
}
async function readWorld(page: Page) { return page.evaluate(() => {
  const debug = (window as unknown as { __lagonDebug: { world: World | null; sessionId: string | null } }).__lagonDebug;
  return { world: debug.world, sessionId: debug.sessionId };
}); }
try {
  const health = await fetch(`${origin}/healthz`); assert.equal(health.status, 200);
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const host = await desktop.newPage(); await ready(host);
  await (await homeControl(host, '#name-input')).fill('Créateur atelier'); await (await homeControl(host, '#track-editor-button')).click(); await host.locator('#track-editor-dialog').waitFor({ state: 'visible' });
  assert.match(await host.locator('#editor-validation').innerText(), /prête à rouler/);
  const title = `Grande boucle atelier ${Date.now().toString().slice(-6)}`;
  await host.locator('#editor-name').fill(title); await host.locator('#editor-theme').selectOption('forest');
  const before = await host.locator('[data-point="2"] circle').first().getAttribute('cx');
  await drag(host, 2, 12, 2); assert.notEqual(await host.locator('[data-point="2"] circle').first().getAttribute('cx'), before);
  await host.locator('#editor-undo').click(); assert.equal(await host.locator('[data-point="2"] circle').first().getAttribute('cx'), before);
  await host.locator('#editor-redo').click(); assert.notEqual(await host.locator('[data-point="2"] circle').first().getAttribute('cx'), before);
  await host.locator('[data-point="2"]').click(); await host.keyboard.press('Shift+ArrowDown');
  const oldStart = await host.locator('[data-point="0"] circle').first().getAttribute('cy');
  await host.locator('[data-point="4"]').click(); await host.locator('#editor-set-start').click();
  assert.notEqual(await host.locator('[data-point="0"] circle').first().getAttribute('cy'), oldStart);
  await host.locator('#editor-undo').click(); assert.equal(await host.locator('[data-point="0"] circle').first().getAttribute('cy'), oldStart);
  await host.locator('#editor-mode-add').click();
  const addition = await host.locator('#editor-canvas').evaluate(svg => {
    const route = svg.querySelector<SVGPathElement>('path[stroke-linejoin="round"]')!;
    const point = route.getPointAtLength(route.getTotalLength() * .07).matrixTransform((svg as unknown as SVGSVGElement).getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await host.mouse.click(addition.x, addition.y); assert.equal(await host.locator('#editor-canvas [data-point]').count(), 9);
  await host.locator('#editor-delete-point').click(); assert.equal(await host.locator('#editor-canvas [data-point]').count(), 8);
  await host.locator('#editor-add-zone').click(); await host.locator('[data-zone="1"][data-field="kind"]').selectOption('ice');
  assert.match(await host.locator('#editor-validation').innerText(), /prête à rouler/);
  record('Création réelle : nom, ambiance, déplacement souris, annuler/rétablir, ajustement clavier, départ repositionnable, point ajouté/supprimé et zone de glace.');

  await host.route('**/api/tracks', async route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Connexion interrompue. Votre circuit reste ici ; réessayez.' }) }) : route.continue());
  await host.locator('#editor-save').click(); await until(async () => /Connexion interrompue/.test(await host.locator('#editor-status').innerText()), 'Erreur de sauvegarde lisible');
  assert.equal(await host.locator('#editor-name').inputValue(), title); await host.unroute('**/api/tracks'); await save(host);
  const saved = (await allTracks()).find(item => item.draft.name === title); assert.ok(saved); assert.equal(saved.draft.theme, 'forest'); assert.equal(saved.draft.zones.length, 2); assert.equal(saved.revision, 1);
  evidence.created = { id: saved.id, revision: saved.revision, name: saved.draft.name, authorName: saved.authorName };
  await capture(host, 'editor-desktop.png'); record('Sauvegarde HTTP : erreur réseau simulée sans perte, réessai réussi, circuit et zones relus dans l’API.');

  await host.locator('#editor-name').fill(`${title} brouillon`); await host.locator('#editor-close').click(); await host.locator('#track-editor-dialog').waitFor({ state: 'hidden' });
  await host.reload({ waitUntil: 'domcontentloaded' }); await host.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await (await homeControl(host, '#track-editor-button')).click(); assert.equal(await host.locator('#editor-name').inputValue(), `${title} brouillon`);
  record('Un brouillon non publié survit à la fermeture de l’éditeur et au rechargement de la page.');

  await host.locator('#editor-canvas').scrollIntoViewIfNeeded(); const first = await pointPosition(host, 0); const second = await pointPosition(host, 1);
  await drag(host, 1, first.x - second.x, first.y - second.y);
  assert.match(await host.locator('#editor-validation').innerText(), /prête à rouler/); assert.equal(await host.locator('#editor-save').isEnabled(), true);
  await save(host); const tightSaved = (await allTracks()).find(item => item.id === saved.id); assert.ok(tightSaved); assert.equal(tightSaved.revision,2);
  assert.ok(Math.hypot(tightSaved.draft.anchors[0]!.x-tightSaved.draft.anchors[1]!.x,tightSaved.draft.anchors[0]!.z-tightSaved.draft.anchors[1]!.z)<1);
  await capture(host, 'editor-creative-curve.png'); await host.locator('#editor-undo').click(); assert.equal(await host.locator('#editor-save').isEnabled(), true);
  await host.locator('#editor-name').fill(title); await host.locator('#editor-name').blur();
  record('Des points collés sont autorisés et réellement sauvegardés en version 2 ; Annuler rétablit la piste sans perdre la version publiée.');

  const catalogueBeforeTrial = await allTracks();
  await host.locator('#editor-try').click(); await until(async () => (await readWorld(host)).world?.phase === 'racing', 'Démarrage de la course d’essai');
  const trial = await readWorld(host); assert.match(trial.world?.trackId ?? '', /^custom-private-/);
  assert.equal(trial.world?.workshop?.selection.group, 'track'); assert.equal(await host.locator('#lap').innerText(), 'LIBRE');
  assert.deepEqual(await allTracks(), catalogueBeforeTrial, 'trying does not publish another revision');
  assert.equal(await host.locator('#leave-button').innerText(), 'Retour à l’éditeur');
  const initialKart = trial.world?.players.find(player => player.id === trial.sessionId); assert.ok(initialKart);
  await host.keyboard.down('ArrowUp');
  try {
    await until(async () => {
      const driven = await readWorld(host); const kart = driven.world?.players.find(player => player.id === driven.sessionId);
      return !!kart && Math.abs(kart.speed) > 1 && Math.hypot(kart.x-initialKart.x,kart.z-initialKart.z)>2;
    }, 'Accélération et déplacement réels pendant l’appui');
    const driven = await readWorld(host); const kart = driven.world?.players.find(player => player.id === driven.sessionId)!;
    evidence.trial = { trackId:driven.world?.trackId, speed:kart.speed, distance:Math.hypot(kart.x-initialKart.x,kart.z-initialKart.z) };
  } finally { await host.keyboard.up('ArrowUp'); }
  await capture(host, 'editor-trial-race.png');
  await host.locator('#leave-button').click(); await host.locator('#track-editor-dialog').waitFor({ state: 'visible' }); assert.equal(await host.locator('#editor-name').inputValue(), title);
  assert.deepEqual(await allTracks(), catalogueBeforeTrial, 'the published version stays intact after the private trial');
  record('Essayer en privé ouvre le brouillon sans publier de version3 ; accélération réelle, version2 intacte et retour dans l’éditeur sans perte.');

  const mobile = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const guest = await mobile.newPage(); await ready(guest); await (await homeControl(guest, '#name-input')).fill('Créatrice mobile'); await (await homeControl(guest, '#track-editor-button')).click();
  await guest.locator(`[data-action="copy"][data-id="${saved.id}"]`).waitFor();
  assert.equal(await guest.locator(`[data-action="open"][data-id="${saved.id}"]`).count(), 0);
  await guest.locator(`[data-action="copy"][data-id="${saved.id}"]`).click();
  await guest.locator('#editor-canvas').scrollIntoViewIfNeeded(); await capture(guest, 'editor-mobile-320.png');
  assert.equal(await guest.locator('#track-editor-dialog').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
  for (const control of await guest.locator('#track-editor-dialog button, #track-editor-dialog input, #track-editor-dialog select').all()) {
    if (!await control.isVisible()) continue; const rect = await control.boundingBox(); assert.ok(rect && rect.height >= 44, `Contrôle tactile trop petit : ${await control.getAttribute('id')} (${rect?.height})`);
  }
  const touchPoint = await pointPosition(guest, 2); const cdp = await mobile.newCDPSession(guest);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchPoint.x, y: touchPoint.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchPoint.x + 3, y: touchPoint.y + 2, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
  await guest.locator('#editor-name').fill('La boucle de mon téléphone'); await guest.locator('#editor-theme').selectOption('neon'); await capture(guest, 'editor-mobile-settings-320.png');
  await save(guest); const duplicate = (await allTracks()).find(item => item.draft.name === 'La boucle de mon téléphone'); assert.ok(duplicate); assert.notEqual(duplicate.id, saved.id); assert.notEqual(duplicate.authorId, saved.authorId);
  assert.deepEqual((await allTracks()).find(item => item.id === saved.id), tightSaved, 'duplication preserves the published source, not the owner’s private draft');
  evidence.duplicate = { id: duplicate.id, name: duplicate.draft.name }; record('Mobile 320×568 : aucun débordement, contrôles ≥44 px, vrai geste tactile, copie d’un autre joueur et sauvegarde indépendante.');
  assert.deepEqual(errors, []); await host.locator('#editor-close').click(); await guest.locator('#editor-close').click();
  await until(async () => (await fetch(`${origin}/healthz`).then(response => response.json()) as { rooms: number }).rooms === 0, 'Fermeture des salons de test');
  await writeFile(join(destination, 'browser-validation.json'), JSON.stringify({ passed: true, timestamp: new Date().toISOString(), checks, captures, errors, evidence, remaining: ['Téléphone physique non testé.', 'Ce scénario UI ne termine pas une course complète ; un contrôle serveur séparé couvre le comptage des tours.'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, captures }, null, 2));
} catch (error) {
  process.exitCode = 1;
  await writeFile(join(destination, 'browser-validation.json'), JSON.stringify({ passed: false, checks, captures, errors, failure: String(error), evidence }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
