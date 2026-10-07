import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import type { World } from '../shared/game.js';

// Explicit origin required: this smoke check creates one ordinary guest profile
// and room, starts a race with CPU opponents, then leaves without a finish fixture.
const origin = process.env.BASE_URL?.replace(/\/$/, '');
assert.ok(origin, 'Set BASE_URL to the deployed origin to check.');
const destination = resolve(process.env.REPORT_DIR ?? 'docs/tournament-fix');
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
page.setDefaultTimeout(45_000);
type Debug = { sessionId: string; world: World | null };
const state = (): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const pause = (ms: number) => new Promise(resolvePause => setTimeout(resolvePause, ms));
const errors: string[] = [], assetErrors: { path: string; status: number }[] = [], loadedAssets = new Set<string>();
const checks: string[] = [];
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const url = new URL(response.url());
  if (url.origin !== origin || !/\.(?:js|css|glb|gltf|png|webp|svg|mp3|ogg|wav)$/.test(url.pathname)) return;
  if (response.status() >= 400) assetErrors.push({ path: url.pathname, status: response.status() });
  else loadedAssets.add(url.pathname);
});
async function until(predicate: () => Promise<boolean>, label: string, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(`Délai dépassé : ${label}`); await pause(100); }
}
async function health() {
  const response = await fetch(`${origin}/healthz`); assert.equal(response.status, 200);
  return await response.json() as { status: string; rooms: number };
}
async function pending() {
  assert.equal(await page.locator('#count-select').inputValue(), '8');
  await until(async () => await page.locator('#ready-button').isDisabled() && await page.locator('#start-button').isDisabled(), 'programme non appliqué bloque prêt et départ');
}
let report: Record<string, unknown> = {};
try {
  const initialHealth = await health();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await page.locator('#name-input').fill('Vérif tournoi');
  await page.locator('#create-button').click();
  await until(async () => (await state()).world?.phase === 'lobby', 'salon créé');
  await page.locator('#mode-select').selectOption('tournament');
  await page.locator('#count-select').selectOption('8');
  await pending();
  await page.locator('#cpu-select').selectOption('2');
  await until(async () => (await state()).world?.players.filter(kart => kart.cpu).length === 2, 'CPU configurés'); await pending();
  await page.locator('#events-select').selectOption('1');
  await until(async () => (await state()).world?.eventLevel === 1, 'événements configurés'); await pending();
  await page.locator('#teams-select').selectOption('teams');
  await until(async () => (await state()).world?.teamMode === true, 'équipes configurées'); await pending();
  assert.equal((await state()).world!.tournament.raceCount, 2);
  const pendingMessage = await page.locator('#configuration-note').innerText();
  assert.match(pendingMessage, /Programme choisi : 8 courses ; programme appliqué : 2 courses/);
  record('Le brouillon de huit courses survit aux changements de CPU, événements et équipes ; Prêt et départ restent désactivés avant application.');
  await page.locator('#configure-button').click();
  await until(async () => (await state()).world?.tournament.raceCount === 8 && await page.locator('#ready-button').isEnabled(), 'huit courses appliquées');
  const applied = (await state()).world!.tournament;
  assert.equal(applied.schedule.length, 8);
  await page.locator('#race-configuration').screenshot({ path: join(destination, 'public-eight-applied.png') });
  record('Le serveur public reçoit le programme de huit courses, affiché dans le salon.');
  await page.locator('#ready-button').click();
  await until(async () => await page.locator('#start-button').isEnabled(), 'départ autorisé');
  await page.locator('#start-button').click();
  await until(async () => (await state()).world?.phase === 'racing', 'décompte naturel terminé');
  const before = await state();
  const firstPosition = before.world!.players.find(kart => kart.id === before.sessionId)!;
  assert.equal(before.world!.tournament.raceIndex, 0); assert.equal(before.world!.tournament.raceCount, 8);
  await page.keyboard.down('ArrowUp'); await pause(2200); await page.keyboard.up('ArrowUp');
  const driving = await state();
  const lastPosition = driving.world!.players.find(kart => kart.id === driving.sessionId)!;
  const distance = Math.hypot(lastPosition.x - firstPosition.x, lastPosition.z - firstPosition.z);
  assert.ok(distance > 1, `Le kart doit avancer avec les touches normales : ${distance} m`);
  assert.match(await page.locator('#tournament-badge').innerText(), /COURSE 1\/8/);
  await page.screenshot({ path: join(destination, 'public-race-start.png') });
  record('La course 1/8 démarre avec sept CPU ; les touches ordinaires déplacent le kart après le vrai décompte.');
  await page.locator('#leave-button').click();
  await until(async () => (await state()).world === null, 'sortie propre du salon');
  let finalHealth = await health();
  if (initialHealth.rooms === 0 && finalHealth.rooms !== 0) {
    await pause(1000); finalHealth = await health();
  }
  assert.deepEqual(errors, []); assert.deepEqual(assetErrors, []);
  assert.ok([...loadedAssets].some(path => path.endsWith('.js')));
  assert.ok([...loadedAssets].some(path => path.endsWith('.glb')));
  record('Aucune erreur JavaScript ni réponse HTTP en échec pour les assets chargés.');
  report = { success: true, origin, executedAt: new Date().toISOString(), initialHealth, finalHealth, checks, pendingMessage, applied,
    distanceDriven: distance, loadedAssets: [...loadedAssets].sort(), errors, assetErrors,
    cleanup: initialHealth.rooms === 0 && finalHealth.rooms === 0 ? 'No rooms before or after this smoke check.' : 'Only this test room was left; other rooms were not modified.',
    scope: 'Public browser smoke test over same-origin HTTPS/WSS. One new guest profile, eight-race configuration, natural start and ordinary keyboard driving in race 1/8. No forced results and no complete public race.' };
  await writeFile(join(destination, 'public.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ origin, checks: checks.length, distanceDriven: distance, initialRooms: initialHealth.rooms, finalRooms: finalHealth.rooms }));
} finally {
  if (!page.isClosed()) {
    const current = await state().catch(() => undefined);
    if (current?.world) await page.locator('#leave-button').click().catch(() => {});
  }
  await browser.close();
}
