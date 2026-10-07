import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createGameServer } from '../server/app.js';
import type { World } from '../shared/game.js';

// Real browser forms and ordinary room messages. No simulation fixtures or
// client-side state mutations. The default server uses a temporary data folder.
const externalOrigin = process.env.BASE_URL?.replace(/\/$/, '');
const directory = externalOrigin ? undefined : await mkdtemp(join(tmpdir(), 'lagon-tournament-config-'));
const previousDirectory = process.env.PLAYER_DATA_DIR;
const previousTracks = process.env.CUSTOM_TRACK_DATA_DIR;
if (directory) { process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks'); }
const server = externalOrigin ? undefined : createGameServer(resolve('dist/client'));
if (server) { await server.ready; await server.gameServer.listen(0, '127.0.0.1'); }
const address = server?.httpServer.address();
if (!externalOrigin) assert.ok(address && typeof address !== 'string');
const origin = externalOrigin ?? `http://127.0.0.1:${(address as { port: number }).port}`;
const destination = resolve(process.env.REPORT_DIR ?? 'docs/tournament-fix');
await mkdir(destination, { recursive: true });
const clientHtml = await fetch(origin).then(response => response.text());
const clientAssets = [...clientHtml.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
type Debug = { sessionId: string; world: World | null };
const state = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const checks: string[] = [], errors: string[] = [], pages: Page[] = [];
const evidence: Record<string, unknown> = { origin, clientAssets, inputMethod: 'Browser select, checkbox and button interactions through real HTTP/WebSocket; no race fixtures.' };
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
async function until(predicate: () => Promise<boolean>, label: string, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(`Délai dépassé : ${label}`); await pause(80); }
}
async function open(page: Page, name: string) {
  pages.push(page); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug);
  await page.locator('#name-input').fill(name);
}
async function pending(page: Page, count: number) {
  assert.equal(await page.locator('#mode-select').inputValue(), 'tournament');
  assert.equal(await page.locator('#count-select').inputValue(), String(count));
  await until(async () => await page.locator('#ready-button').isDisabled() && await page.locator('#start-button').isDisabled(), 'brouillon bloque prêt et départ');
  assert.match(await page.locator('#configuration-note').innerText(), new RegExp(`Programme choisi : ${count} courses ; programme appliqué :`));
}
async function apply(host: Page, guest: Page, count: number) {
  await host.locator('#configure-button').click();
  await until(async () => (await state(host)).world?.tournament.raceCount === count && (await state(guest)).world?.tournament.raceCount === count && await host.locator('#ready-button').isEnabled(), 'programme appliqué et partagé');
}
try {
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  const host = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 800, height: 800 } })).newPage();
  await open(host, 'Tournoi Hôte'); await host.locator('#create-button').click();
  await until(async () => (await state(host)).world?.phase === 'lobby', 'salon hôte');
  const link = await host.locator('#share-url').inputValue();
  await open(guest, 'Tournoi Invité'); await guest.locator('#code-input').fill(new URL(link).pathname.split('/').pop()!);
  await guest.locator('#join-button').click(); await until(async () => (await state(host)).world?.players.length === 2 && (await state(guest)).world?.phase === 'lobby', 'invité connecté');
  await host.locator('#mode-select').selectOption('tournament'); await host.locator('#count-select').selectOption('8');
  const schedule = ['lagon', 'canyon', 'glacier', 'neon', 'mangrove', 'dunes', 'forest', 'harbor'];
  for (const [index, track] of schedule.entries()) await host.locator(`[data-schedule-index="${index}"]`).selectOption(track);
  await pending(host, 8);
  await host.locator('#cpu-select').selectOption('2');
  await until(async () => (await state(host)).world?.players.filter(kart => kart.cpu).length === 2, 'CPU configurés'); await pending(host, 8);
  await host.locator('#events-select').selectOption('1');
  await until(async () => (await state(host)).world?.eventLevel === 1, 'événements configurés'); await pending(host, 8);
  await host.locator('#teams-select').selectOption('teams');
  await until(async () => (await state(host)).world?.teamMode === true, 'équipes activées'); await pending(host, 8);
  assert.equal((await state(host)).world?.tournament.raceCount, 2);
  for (const [index, track] of schedule.entries()) assert.equal(await host.locator(`[data-schedule-index="${index}"]`).inputValue(), track);
  evidence.pendingTeams = { chosenRaceCount: 8, applied: (await state(host)).world!.tournament, message: await host.locator('#configuration-note').innerText() };
  await host.locator('#configuration-controls').screenshot({ path: join(destination, 'configuration-pending.png') });
  // Synthetic click events exercise the handlers too; disabled buttons cannot
  // otherwise be activated by the user. They must send no ready/start message.
  await host.locator('#ready-button').dispatchEvent('click'); await host.locator('#start-button').dispatchEvent('click'); await pause(250);
  const blocked = await state(host); assert.equal(blocked.world?.phase, 'lobby');
  assert.equal(blocked.world?.players.find(kart => kart.id === blocked.sessionId)?.ready, false);
  assert.equal(await guest.locator('#ready-button').isEnabled(), true);
  record('Le brouillon de huit courses et son ordre survivent aux changements de CPU, météo et équipes ; le défaut serveur de deux courses reste clairement distingué.');
  record('Prêt et départ sont bloqués pour l’hôte tant que le programme choisi reste non appliqué ; l’invité garde ses propres commandes.');
  await apply(host, guest, 8); assert.deepEqual((await state(host)).world!.tournament.schedule, schedule);
  assert.deepEqual((await state(host)).world!.tournament, (await state(guest)).world!.tournament);
  await host.locator('#race-configuration').screenshot({ path: join(destination, 'configuration-eight-applied.png') });
  record('Appliquer publie réellement les huit courses pour les deux navigateurs et réactive Prêt.');

  await host.locator('#count-select').selectOption('4'); await pending(host, 4);
  await host.locator('#teams-select').selectOption('solo');
  await until(async () => (await state(host)).world?.teamMode === false, 'équipes désactivées'); await pending(host, 4);
  await host.locator('#cpu-select').selectOption('1');
  await until(async () => (await state(host)).world?.players.filter(kart => kart.cpu).length === 1, 'CPU modifiés'); await pending(host, 4);
  await apply(host, guest, 4); assert.deepEqual((await state(host)).world!.tournament.schedule, schedule.slice(0, 4));
  record('Un programme déjà appliqué de huit courses peut devenir quatre courses sans perdre le brouillon lorsque les équipes ou CPU changent.');
  await host.locator('[data-schedule-index="0"]').selectOption('dunes');
  await until(async () => await host.locator('#ready-button').isDisabled(), 'changement de circuit avec même nombre de courses');
  assert.match(await host.locator('#configuration-note').innerText(), /Le choix des circuits a été modifié/);
  await host.locator('[data-schedule-index="0"]').selectOption(schedule[0]);
  await until(async () => await host.locator('#ready-button').isEnabled(), 'retour au programme appliqué');
  record('Changer seulement un circuit exige aussi une application ; revenir exactement au programme appliqué débloque Prêt sans nouvelle requête.');

  await host.locator('#selection-select').selectOption('random'); await host.locator('#count-select').selectOption('8');
  const poolIds = await host.locator('[data-pool-track]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).dataset.poolTrack!));
  for (const id of poolIds) await host.locator(`[data-pool-track="${id}"]`).setChecked(id === 'canyon' || id === 'glacier');
  await host.locator('#events-select').selectOption('2');
  await until(async () => (await state(host)).world?.eventLevel === 2, 'météo changée avec tirage en attente'); await pending(host, 8);
  assert.equal(await host.locator('#selection-select').inputValue(), 'random');
  assert.deepEqual(await host.locator('[data-pool-track]:checked').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).dataset.poolTrack!).sort()), ['canyon', 'glacier']);
  await apply(host, guest, 8);
  const random = (await state(host)).world!.tournament; assert.equal(random.schedule.length, 8);
  assert.deepEqual([...random.trackPool].sort(), ['canyon', 'glacier']); assert.ok(random.schedule.every(track => random.trackPool.includes(track)));
  await host.locator('#cpu-select').selectOption('3'); await until(async () => (await state(host)).world?.players.filter(kart => kart.cpu).length === 3, 'CPU changés après application');
  assert.deepEqual((await state(host)).world!.tournament.schedule, random.schedule); assert.equal(await host.locator('#ready-button').isEnabled(), true);
  evidence.random = random;
  record('Le tirage de huit courses conserve les deux circuits cochés pendant un changement météo ; les réglages CPU ultérieurs conservent le tirage appliqué.');

  await host.locator('#count-select').selectOption('4'); await pending(host, 4);
  const oldSession = (await state(host)).sessionId;
  await host.locator('#leave-button').click(); await until(async () => (await state(host)).world === null, 'départ du premier salon');
  await host.locator('#create-button').click(); await until(async () => (await state(host)).world?.phase === 'lobby', 'nouveau salon');
  assert.notEqual((await state(host)).sessionId, oldSession); assert.equal((await state(host)).world!.tournament.mode, 'single');
  assert.equal(await host.locator('#mode-select').inputValue(), 'single'); assert.equal(await host.locator('#count-select').count(), 0);
  assert.equal(await host.locator('#ready-button').isEnabled(), true); assert.doesNotMatch(await host.locator('#configuration-note').innerText(), /Programme choisi/);
  record('Quitter un salon avec un brouillon puis créer un autre salon initialise les réglages du nouveau salon sans réutiliser l’ancien brouillon.');
  assert.deepEqual(errors, []); record('Aucune erreur JavaScript dans les deux navigateurs.');
  await writeFile(join(destination, 'configuration-after.json'), JSON.stringify({ success: true, at: new Date().toISOString(), ...evidence, checks, errors, raceCompletion: 'Aucune fin de course forcée ni course complète dans ce test ciblé de configuration.' }, null, 2));
} finally {
  await Promise.allSettled(pages.map(async page => { if ((await state(page)).world) await page.locator('#leave-button').click(); }));
  await browser.close();
  if (server) await server.gameServer.gracefullyShutdown(false);
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
  if (previousTracks === undefined) delete process.env.CUSTOM_TRACK_DATA_DIR; else process.env.CUSTOM_TRACK_DATA_DIR = previousTracks;
  if (directory) await rm(directory, { recursive: true, force: true });
}
