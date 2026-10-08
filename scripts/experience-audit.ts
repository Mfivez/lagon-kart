import { homeControl } from './menu-navigation.js';
/** Read-only UI audit against an isolated running server. No simulation fixtures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const origin = process.env.BASE_URL ?? 'http://127.0.0.1:3108';
const destination = resolve(process.env.REPORT_DIR ?? 'docs/fun-experience/baseline');
await mkdir(destination, { recursive: true });
const errors: string[] = [], checks: string[] = [];
const evidence: Record<string, unknown> = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function open(page: Page) {
  page.setDefaultTimeout(25_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  if (await page.locator('#home-ranked').count()) await page.locator('[data-ranked-mmr]').filter({ hasText: /MMR/ }).waitFor();
}
async function layout(page: Page) {
  return page.evaluate(() => {
    const ids = ['name-input', 'home-ranked', 'home-ranked-action', 'create-button', 'join-button', 'practice-button', 'choose-track-button', 'home-tab-pilot', 'home-tab-online', 'home-tab-options'].filter(id => document.getElementById(id)?.checkVisibility());
    const menu = document.getElementById('menu')!;
    return { viewport: { width: innerWidth, height: innerHeight }, scrollHeight: menu.scrollHeight,
      actions: ids.map(id => { const element = document.getElementById(id)!; const r = element.getBoundingClientRect();
        return { id, x: r.x, y: r.y, width: r.width, height: r.height, initiallyInView: r.top >= 0 && r.bottom <= innerHeight }; }),
      title: { right: document.querySelector('h1')!.getBoundingClientRect().right, text: document.querySelector('h1')!.innerText } };
  });
}
async function capture(page: Page, name: string) {
  const session = await page.context().newCDPSession(page);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const shot = await Promise.race([
      session.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error(`Capture timeout: ${name}`)), 35000); }),
    ]);
    await writeFile(resolve(destination, name), Buffer.from(shot.data, 'base64'));
  } finally { clearTimeout(timeout); await session.detach(); }
}
try {
  const html = await fetch(origin).then(response => response.text());
  evidence.assets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const desktop = await desktopContext.newPage(); await open(desktop);
  evidence.desktopHome = await layout(desktop); await capture(desktop, 'home-desktop.png');
  await (await homeControl(desktop, '#name-input')).fill('Essai expérience');
  await (await homeControl(desktop, '#create-button')).click();
  await desktop.locator('#room-code').waitFor({ state: 'visible' });
  if (process.env.VALIDATE_HOME === '1') {
    const before = await desktop.locator('.lobby-ready-bar').boundingBox(); assert.ok(before);
    await desktop.locator('.lobby-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const after = await desktop.locator('.lobby-ready-bar').boundingBox(); assert.deepEqual(after, before);
    assert.ok(after.y >= 0 && after.y + after.height <= 900, 'Readiness stays in view');
    await desktop.locator('.lobby-scroll').evaluate(element => { element.scrollTop = 0; });
    evidence.fixedReadyBar = before;
  }
  await capture(desktop, 'lobby-desktop.png');
  evidence.lobby = { text: (await desktop.locator('#lobby-panel').innerText()).slice(0, 3500) };
  await desktop.locator('#leave-button').click();
  checks.push('Accueil ordinateur, création de salon et sortie par interface.');
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage(); await open(mobile);
  const mobileHome = await layout(mobile); evidence.mobileHome = mobileHome;
  if (process.env.VALIDATE_HOME === '1') {
    assert.ok(mobileHome.title.right <= 320, 'Title fits320');
    for (const id of ['home-ranked', 'home-ranked-action', 'create-button', 'join-button', 'practice-button']) assert.ok(mobileHome.actions.find(action => action.id === id)?.initiallyInView, `${id} visible without scrolling`);
  }
  await capture(mobile, 'home-mobile-320.png');
  await (await homeControl(mobile, '#practice-button')).scrollIntoViewIfNeeded();
  evidence.scrollToPlay = await mobile.locator('#menu').evaluate(element => element.scrollTop);
  await capture(mobile, 'home-mobile-actions.png');
  if (process.env.VALIDATE_HOME === '1') {
    await (await homeControl(mobile, '#create-button')).tap();
    await mobile.locator('#room-code').waitFor({ state: 'visible' });
    const readyBefore = await mobile.locator('.lobby-ready-bar').boundingBox(); assert.ok(readyBefore);
    await mobile.locator('.lobby-scroll').evaluate(element => { element.scrollTop = element.scrollHeight; });
    const readyAfter = await mobile.locator('.lobby-ready-bar').boundingBox(); assert.deepEqual(readyAfter, readyBefore);
    const footer = await mobile.locator('footer').boundingBox();
    assert.ok(readyAfter.y >= 0 && readyAfter.y + readyAfter.height <= (footer?.y ?? 568), 'Mobile readiness stays above footer');
    evidence.mobileReadyBar = readyAfter;
    await capture(mobile, 'lobby-mobile-320.png');
    await mobile.locator('#leave-button').tap();
    await mobile.locator('#practice-button').waitFor({ state: 'visible' });
  }
  await (await homeControl(mobile, '#practice-button')).tap();
  await mobile.waitForFunction(() => (window as unknown as { __lagonDebug?: { world?: { phase: string } } }).__lagonDebug?.world?.phase === 'racing');
  await pause(2000); await capture(mobile, 'race-mobile-320.png');
  evidence.mobileRace = await mobile.evaluate(() => {
    const debug = (window as unknown as { __lagonDebug: { fps: number; quality: string; world: { players: Array<{ speed: number; id: string }> }; sessionId: string; view: { calls: number; triangles: number } } }).__lagonDebug;
    const kart = debug.world.players.find(player => player.id === debug.sessionId);
    return { fpsSoftwareRendererOnly: debug.fps, quality: debug.quality, speed: kart?.speed, renderCalls: debug.view.calls, triangles: debug.view.triangles,
      controls: [...document.querySelectorAll<HTMLElement>('.touch-controls button')].filter(element => element.getClientRects().length).map(element => ({ label: element.getAttribute('aria-label') ?? element.innerText, rect: element.getBoundingClientRect().toJSON() })) };
  });
  await mobile.locator('#leave-button').tap();
  await (await homeControl(mobile, '#track-editor-button')).tap();
  await mobile.locator('#track-editor-dialog').waitFor({ state: 'visible' });
  await capture(mobile, 'editor-mobile-320.png');
  evidence.mobileEditor = await mobile.locator('#track-editor-dialog').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, text: (element as HTMLElement).innerText.slice(0, 1200) }));
  await mobile.locator('#editor-close').tap();
  checks.push('Mobile320 : accès à l’entraînement, départ réel, conduite AUTO, sortie et ouverture/fermeture de l’éditeur.');
  await mobile.setViewportSize({ width: 667, height: 375 });
  await capture(mobile, 'home-mobile-landscape.png');
  evidence.landscapeHome = await layout(mobile);
  await mobileContext.close();
  await pause(400);
  evidence.healthAfter = await fetch(origin + '/healthz').then(response => response.json());
  assert.deepEqual(errors, []);
  await writeFile(resolve(destination, 'audit.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), origin, checks, errors, evidence,
    limitations: ['Chromium avec rendu logiciel SwiftShader, pas une mesure de fluidité sur GPU.', 'Gestes mobiles émulés ; aucun téléphone physique.', 'Ce parcours bref ne mesure pas le plaisir humain et ne termine aucune course.'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks: checks.length, evidence }, null, 2));
} catch (error) {
  process.exitCode = 1;
  await writeFile(resolve(destination, 'audit.json'), JSON.stringify({ passed: false, error: String(error), errors, checks, evidence }, null, 2) + '\n');
  console.error(error);
} finally { await browser.close(); }
