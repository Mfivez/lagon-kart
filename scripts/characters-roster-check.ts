import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createGameServer } from '../server/app.js';
import { CHARACTERS } from '../shared/characters.js';
import type { World } from '../shared/game.js';

// The actual application and two independent browser contexts. The default
// server/store are private and temporary; BASE_URL explicitly selects a public
// UI smoke check without instantiating any server or modifying local data.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicOrigin = process.env.BASE_URL?.replace(/\/$/, '');
const directory = publicOrigin ? undefined : await mkdtemp(join(tmpdir(), 'lagon-roster-browser-'));
const previousDirectory = process.env.PLAYER_DATA_DIR;
if (directory) process.env.PLAYER_DATA_DIR = directory;
const destination = resolve(root, 'docs/characters', publicOrigin ? 'public' : ''); await mkdir(destination, { recursive: true });
const server = publicOrigin ? undefined : createGameServer(resolve(root, 'dist/client'));
if (server) await server.gameServer.listen(0, '127.0.0.1');
const address = server?.httpServer.address();
if (!publicOrigin) assert.ok(address && typeof address !== 'string');
const origin = publicOrigin ?? `http://127.0.0.1:${(address as { port: number }).port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
type Diagnostics = { sessionId: string | null; connected: boolean; world: World | null;
  kartAssets: { status: string; fallbackCount: number; loadCount: number;
    models: Record<string, { status: string; loadCount: number; characters: string[] }> } };
const checks: string[] = [], errors: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = {};
const pages: Page[] = [];
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const state = (page: Page): Promise<Diagnostics> => page.evaluate(() => (window as unknown as { __lagonDebug: Diagnostics }).__lagonDebug);
async function until(predicate: () => Promise<boolean>, label: string, timeout = 45000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > end) throw new Error('Délai dépassé : ' + label); await pause(100); }
}
async function ready(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: Diagnostics }).__lagonDebug, undefined, { timeout: 45000 });
}
async function phase(page: Page, expected: World['phase']) {
  await until(async () => (await state(page)).world?.phase === expected, expected);
}
async function capture(page: Page, file: string) {
  await page.screenshot({ path: join(destination, file) }); captures.push(file);
}
async function choose(page: Page, id: string, inLobby = false) {
  await page.locator(inLobby ? '#lobby-garage-button' : '#garage-button').click();
  await page.locator('#garage-dialog').waitFor({ state: 'visible' });
  await page.locator('#character-select').selectOption(id);
  await until(async () => (await state(page)).kartAssets.models.zsky?.characters.includes(id) === true, `aperçu ${id}`);
}
try {
  if (publicOrigin) {
    const response = await fetch(`${origin}/healthz`); assert.equal(response.status, 200);
    const health = await response.json() as { status: string; rooms: number };
    assert.equal(health.rooms, 0, 'Aucun salon occupé avant le smoke public'); evidence.healthBefore = health;
  }
  const html = await fetch(origin).then(response => response.text());
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const mobile = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const host = await desktop.newPage(), guest = await mobile.newPage();
  pages.push(host, guest);
  for (const [index, page] of pages.entries()) {
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(`Client ${index + 1}: ${error.message}`));
    page.on('response', response => {
      if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await ready(page);
    await page.locator('#name-input').fill(index === 0 ? 'Pilote Parodie' : 'Invité Cartoon');
    await choose(page, index === 0 ? 'plumber' : 'chemist');
    assert.deepEqual(await page.locator('#character-select option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value)), CHARACTERS.map(character => character.id));
  }
  await capture(host, 'garage-roster-desktop.png');
  await guest.locator('#character-select').scrollIntoViewIfNeeded();
  const dialog = await guest.locator('#garage-dialog').boundingBox(); assert.ok(dialog);
  assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= 321 && dialog.height <= 568);
  assert.equal(await guest.locator('#garage-dialog').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
  const select = await guest.locator('#character-select').boundingBox();
  assert.ok(select && select.height >= 44, `Sélecteur tactile : ${select?.height ?? 0} px, attendu ≥44 px`);
  await capture(guest, 'garage-roster-mobile-320.png');
  await Promise.all(pages.map(page => page.locator('#garage-close').click()));
  record(`Les ${CHARACTERS.length} pilotes sont accessibles dans le garage ; aperçu 3D sur desktop et écran tactile 320×568, sélecteur ≥44 px sans débordement horizontal.`);

  await host.reload({ waitUntil: 'domcontentloaded' }); await ready(host);
  await host.locator('#garage-button').click(); await host.locator('#garage-dialog').waitFor({ state: 'visible' });
  assert.equal(await host.locator('#character-select').inputValue(), 'plumber');
  await host.locator('#garage-close').click();
  record('Le choix du nouveau pilote est conservé après rechargement de la page.');

  await host.locator('#create-button').click(); await phase(host, 'lobby');
  const roomId = new URL(await host.locator('#share-url').inputValue()).pathname.split('/').pop()!;
  await guest.locator('#code-input').fill(roomId); await guest.locator('#join-button').click(); await phase(guest, 'lobby');
  await until(async () => (await state(host)).world!.players.length === 2, 'deux clients');
  const hostId = (await state(host)).sessionId!, guestId = (await state(guest)).sessionId!;
  for (const page of pages) {
    await until(async () => {
      const view = await state(page);
      return view.world!.players.some(kart => kart.id === hostId && kart.characterId === 'plumber')
        && view.world!.players.some(kart => kart.id === guestId && kart.characterId === 'chemist')
        && view.kartAssets.models.zsky?.characters.includes('plumber') === true
        && view.kartAssets.models.zsky?.characters.includes('chemist') === true;
    }, 'choix reçus et rendus par les deux clients');
  }
  record('Deux navigateurs indépendants rejoignent le même salon Colyseus ; les personnages choisis à la connexion sont reçus et rendus des deux côtés.');

  const accepted: string[] = [];
  let baselineStats = '';
  for (const character of (publicOrigin ? CHARACTERS.filter(character => character.id === 'space') : CHARACTERS.slice(5))) {
    await choose(host, character.id, true);
    const stats = await host.locator('.garage-stats').innerText();
    if (!baselineStats) baselineStats = stats; else assert.equal(stats, baselineStats);
    await host.locator('#garage-close').click();
    await until(async () => (await Promise.all(pages.map(state))).every(view =>
      view.world!.players.find(kart => kart.id === hostId)?.characterId === character.id
      && view.kartAssets.models.zsky?.characters.includes(character.id) === true), `personnage ${character.id} partagé`);
    assert.ok((await guest.locator('#player-list').innerText()).includes(character.name));
    accepted.push(character.id);
  }
  evidence.acceptedCharacterIds = accepted;
  assert.equal(accepted.length, publicOrigin ? 1 : CHARACTERS.length - 5);
  await capture(host, 'lobby-new-drivers.png');
  record(publicOrigin
    ? 'Un changement de nouveau pilote dans le vrai garage est accepté par le serveur public et répliqué au second client.'
    : `Les ${CHARACTERS.length - 5} nouveaux pilotes sont sélectionnés par le vrai garage, acceptés par le serveur et répliqués au second client ; les caractéristiques de conduite restent identiques.`);

  const raceCount = publicOrigin ? 2 : 8;
  if (!publicOrigin) await host.locator('#cpu-select').selectOption('6');
  await until(async () => (await state(host)).world!.players.length === raceCount, `${raceCount} pilotes`);
  for (const page of pages) await page.locator('#ready-button').click();
  await until(async () => (await state(host)).world!.players.every(kart => kart.ready), 'prêts');
  await host.locator('#start-button').click(); await Promise.all(pages.map(page => phase(page, 'racing')));
  const start = (await state(host)).world!.players.filter(kart => [hostId, guestId].includes(kart.id)).map(kart => ({ id: kart.id, x: kart.x, z: kart.z }));
  // Use ordinary key events, including on the emulated mobile page. This checks
  // rendering/replication while driving, not mobile hardware ergonomics.
  for (const page of pages) await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await Promise.all(pages.map(page => page.keyboard.down('ArrowUp')));
  await until(async () => {
    const world = (await state(host)).world!;
    return start.every(position => { const kart = world.players.find(kart => kart.id === position.id)!;
      return kart.speed > 2 && Math.hypot(kart.x - position.x, kart.z - position.z) > 3; });
  }, 'déplacement autoritaire des deux joueurs');
  await Promise.all(pages.map(page => page.keyboard.up('ArrowUp')));
  const running = (await state(host)).world!;
  evidence.driving = start.map(position => {
    const kart = running.players.find(kart => kart.id === position.id)!;
    return { id: kart.id, characterId: kart.characterId, distance: Math.hypot(kart.x - position.x, kart.z - position.z), inputSequence: kart.lastSeq };
  });
  for (const page of pages) {
    const view = await state(page);
    assert.equal(view.kartAssets.fallbackCount, 0);
    assert.equal(view.kartAssets.models.zsky!.loadCount, 1);
    assert.equal(view.world!.players.length, raceCount);
    assert.equal(view.world!.players.find(kart => kart.id === hostId)!.characterId, 'space');
    assert.equal(view.world!.players.find(kart => kart.id === guestId)!.characterId, 'chemist');
  }
  await capture(host, `race-new-drivers-${raceCount}-karts.png`);
  await capture(guest, 'race-new-drivers-mobile-320.png');
  record(`Départ réel à ${raceCount} karts (${publicOrigin ? 'deux humains' : 'deux humains et six CPU'}), déplacement au clavier confirmé pour les deux nouveaux pilotes ; aucun modèle de secours, un chargement GLB par navigateur.`);

  for (const page of pages) {
    await page.locator('#leave-button').click();
    await until(async () => (await state(page)).world === null, 'sortie du salon');
  }
  await host.evaluate(() => localStorage.setItem('lagon-character', '__proto__'));
  await host.reload({ waitUntil: 'domcontentloaded' }); await ready(host);
  await host.locator('#garage-button').click(); await host.locator('#garage-dialog').waitFor({ state: 'visible' });
  assert.equal(await host.locator('#character-select').inputValue(), 'racer');
  record('Un identifiant local invalide revient au pilote par défaut sans empêcher l’ouverture du garage.');
  if (publicOrigin) {
    await until(async () => (await fetch(`${origin}/healthz`).then(response => response.json()) as { rooms: number }).rooms === 0, 'salons publics libérés');
    evidence.healthAfter = await fetch(`${origin}/healthz`).then(response => response.json());
    record('Le serveur public est sain et ne conserve aucun salon de test après la sortie des deux joueurs.');
  }
  assert.deepEqual(errors, []);
  await writeFile(join(destination, 'roster-browser-validation.json'), JSON.stringify({ passed: true, at: new Date().toISOString(),
    command: 'node --import tsx scripts/characters-roster-check.ts',
    origin, public: Boolean(publicOrigin),
    scope: `${publicOrigin ? 'Serveur public, deux pilotes invités créés par les formulaires ordinaires' : 'Serveur privé et stockage temporaire'} ; deux contextes Chromium indépendants dont un écran mobile émulé. Départ et conduite réels, aucune course complète ni téléphone physique testé.`,
    checks, captures, errors, evidence }, null, 2) + '\n');
  console.log(`Characters roster: ${checks.length}/${checks.length} checks passed.`);
} catch (error) {
  process.exitCode = 1;
  console.error(error);
  for (const [index, page] of pages.entries()) {
    await page.screenshot({ path: join(destination, `failed-client-${index + 1}.png`) }).catch(() => {});
  }
  throw error;
} finally {
  for (const page of pages) {
    if ((await state(page).catch(() => undefined))?.world) await page.locator('#leave-button').click({ timeout: 3000 }).catch(() => {});
  }
  await browser.close();
  if (server) await server.gameServer.gracefullyShutdown(false);
  if (directory) {
    if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
}
