import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { createGameServer } from '../server/app.js';
import { playerStore } from '../server/career.js';
import type { PlayerProfile } from '../shared/progression.js';
import type { World } from '../shared/game.js';

// A private application server and temporary store. Progression is deliberately
// seeded via the authoritative store: this checks account recovery, not driving.
const directory = await mkdtemp(join(tmpdir(), 'lagon-account-browser-'));
const previousDirectory = process.env.PLAYER_DATA_DIR; process.env.PLAYER_DATA_DIR = directory;
const destination = resolve('docs/accounts'); await mkdir(destination, { recursive: true });
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const checks: string[] = [], captures: string[] = [], errors: string[] = [];
const evidence: Record<string, unknown> = {};
const username = 'Classe.Étoile', password = 'kart-classe-2026';
const record = (label: string) => { checks.push(label); console.log('✓ ' + label); };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, label: string) {
  const end = Date.now() + 25000;
  while (!await predicate()) { if (Date.now() > end) throw Error(label); await wait(80); }
}
async function ready(page: Page) {
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug: unknown }).__lagonDebug);
}
async function token(page: Page) { return await page.evaluate(() => localStorage.getItem('lagon-player-token') ?? ''); }
async function profile(page: Page): Promise<PlayerProfile> {
  const response = await fetch(`${origin}/api/me`, { headers: { Authorization: `Bearer ${await token(page)}` } });
  assert.equal(response.status, 200); return (await response.json() as { profile: PlayerProfile }).profile;
}
async function credentials(page: Page, secret = password, confirmation?: string) {
  await page.locator('#account-username').fill(username);
  await page.locator('#account-password').fill(secret);
  if (confirmation !== undefined) await page.locator('#account-confirm').fill(confirmation);
}
async function submit(page: Page) { await page.locator('#account-submit').click(); }
async function capture(page: Page, filename: string) { await page.screenshot({ path: join(destination, filename) }); captures.push(filename); }
async function noPasswordStorage(page: Page) {
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert.equal(storage.includes(password), false); assert.equal(storage.includes('wrong-password'), false);
}
try {
  const html = await fetch(origin).then(response => response.text());
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const first = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await first.newPage(); await ready(page);
  assert.match(await page.locator('#account-card').innerText(), /Pilote invité/);
  await page.locator('#name-input').fill('Pilote des îles');
  await page.locator('#career-button').click(); await page.locator('#career-dialog').waitFor({ state: 'visible' });
  const guest = await profile(page); await page.locator('#career-close').click();
  const store = await playerStore();
  await store.recordRace({ id: 'account-browser-fixture', trackId: 'lagon', ranked: false, finishedAt: Date.now(), entries: [{ playerId: guest.id, rank: 1, finished: true, finishTime: 125 }] });
  const fixture = await store.completeChampionship(guest.id, 'discovery', 1, 2);
  assert.equal(fixture.xp, 195); assert.equal(fixture.careerLevel, 1);
  evidence.fixture = { label: 'Résultat fictif appliqué au store privé : 1 victoire + coupe discovery, aucune course complète conduite.', xp: fixture.xp, careerLevel: fixture.careerLevel, championships: fixture.completedChampionships };
  record('Jeu invité conservé : un profil anonyme peut recevoir une progression avant la création du compte.');

  await page.locator('[data-account="register"]').click();
  await credentials(page, password, 'autre-mot-de-passe'); await submit(page);
  assert.match(await page.locator('#account-error').innerText(), /différents/);
  assert.equal((await profile(page)).username, undefined);
  await page.locator('#account-confirm').fill(password); await submit(page);
  await page.locator('#account-dialog').waitFor({ state: 'hidden' });
  const registered = await profile(page), firstToken = await token(page);
  assert.equal(registered.id, guest.id); assert.equal(registered.username, username);
  assert.equal(registered.xp, fixture.xp); assert.deepEqual(registered.completedChampionships, ['discovery']);
  assert.match(await page.locator('#account-card').innerText(), /195 XP/);
  await noPasswordStorage(page); await capture(page, 'account-desktop.png');
  record('Inscription par le formulaire : confirmation vérifiée, même pilote, 195 XP et coupe conservés, aucun mot de passe dans les stockages du navigateur.');
  await first.close();

  const second = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await second.newPage(); await ready(mobile);
  assert.equal(await token(mobile), '');
  await mobile.locator('[data-account="register"]').click(); await capture(mobile, 'register-mobile-320x568.png');
  const dialogBox = await mobile.locator('#account-dialog').boundingBox(); assert.ok(dialogBox);
  assert.ok(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 321 && dialogBox.height <= 568);
  const overflow = await mobile.locator('#account-dialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth + 1); assert.equal(overflow, false);
  for (const input of await mobile.locator('#account-dialog input, #account-dialog button').all()) {
    const box = await input.boundingBox(); assert.ok(box && box.height >= 44, 'Champ et bouton tactiles ≥44 px');
  }
  record('Formulaire à 320×568 : dialogue dans l’écran, défilement vertical, aucune largeur débordante, champs et boutons ≥44 px.');

  await credentials(mobile, password, password); await submit(mobile);
  await until(async () => /déjà utilisé/.test(await mobile.locator('#account-error').innerText()), 'Doublon refusé');
  const secondGuest = await profile(mobile); assert.notEqual(secondGuest.id, guest.id); assert.equal(secondGuest.username, undefined);
  await mobile.locator('#account-switch').click(); await credentials(mobile, 'wrong-password'); await submit(mobile);
  await until(async () => /incorrect/.test(await mobile.locator('#account-error').innerText()), 'Mauvais mot de passe refusé');
  assert.equal((await profile(mobile)).id, secondGuest.id);
  record('Doublon et mot de passe incorrect : erreurs visibles, progression du pilote courant intacte.');

  await mobile.evaluate(() => { localStorage.setItem('lagon-name', 'Ancien invité'); sessionStorage.setItem('lagon-session', JSON.stringify({ token: 'obsolete', roomId: 'old-room' })); });
  await credentials(mobile); await submit(mobile); await mobile.locator('#account-dialog').waitFor({ state: 'hidden' });
  const recovered = await profile(mobile);
  assert.equal(recovered.id, guest.id); assert.equal(recovered.xp, 195); assert.equal(recovered.careerLevel, 1);
  assert.equal(recovered.name, 'Pilote des îles'); assert.equal(await mobile.locator('#name-input').inputValue(), recovered.name);
  assert.equal(await mobile.evaluate(() => sessionStorage.getItem('lagon-session')), null);
  await noPasswordStorage(mobile); await capture(mobile, 'recovered-mobile-320x568.png');
  record('Second navigateur indépendant : connexion récupère le même nom, les XP et les déblocages ; ancienne reconnexion supprimée.');

  await mobile.locator('#career-button').click(); await mobile.locator('#career-dialog').waitFor({ state: 'visible' });
  assert.match(await mobile.locator('#career-dialog').innerText(), /195 XP/);
  assert.match(await mobile.locator('[data-cup="discovery"]').innerText(), /✓/);
  await capture(mobile, 'career-recovered-mobile.png'); await mobile.locator('#career-close').click();
  await mobile.evaluate(() => localStorage.setItem('lagon-name', 'Nom périmé'));
  await mobile.reload({ waitUntil: 'domcontentloaded' });
  await until(async () => await mobile.locator('#name-input').inputValue() === 'Pilote des îles', 'Nom récupéré après actualisation');
  await mobile.locator('#career-button').click(); await mobile.locator('#career-dialog').waitFor({ state: 'visible' });
  assert.equal((await profile(mobile)).name, 'Pilote des îles'); await mobile.locator('#career-close').click();
  record('Actualisation : compte restauré automatiquement ; un ancien nom local ne remplace jamais le nom sauvegardé.');

  await mobile.locator('#create-button').click(); await mobile.locator('#lobby-panel').waitFor({ state: 'visible' });
  const joined = await mobile.evaluate(() => {
    const debug = (window as unknown as { __lagonDebug: { sessionId: string; world: World } }).__lagonDebug;
    return debug.world.players.find(player => player.id === debug.sessionId)!;
  });
  assert.equal(joined.playerId, guest.id); assert.equal(joined.careerLevel, 1);
  const mobileToken = await token(mobile);
  // Account controls are hidden during a race; also exercise their defensive
  // handler with a programmatic click while this real room is active.
  await mobile.locator('[data-account="logout"]').evaluate((button: HTMLElement) => button.click());
  assert.equal(await token(mobile), mobileToken); assert.match(await mobile.locator('#toast').innerText(), /Quittez le salon/);
  await mobile.locator('#leave-button').click(); await mobile.locator('#home-panel').waitFor({ state: 'visible' });
  record('Salon Colyseus réel avec le compte récupéré ; garde de changement de compte active tant que le salon est ouvert.');
  await mobile.locator('[data-account="logout"]').click();
  await until(async () => await token(mobile) === '', 'Déconnexion locale');
  assert.equal(await mobile.evaluate(() => sessionStorage.getItem('lagon-session')), null);
  assert.match(await mobile.locator('#account-card').innerText(), /Pilote invité/);
  assert.equal((await fetch(`${origin}/api/me`, { headers: { Authorization: `Bearer ${mobileToken}` } })).status, 401);
  assert.equal((await fetch(`${origin}/api/me`, { headers: { Authorization: `Bearer ${firstToken}` } })).status, 200);
  record('Déconnexion : session courante révoquée, données du compte conservées, autre session valide et reconnexion locale effacée.');
  await mobile.locator('[data-account="login"]').click(); await credentials(mobile); await submit(mobile);
  await mobile.locator('#account-dialog').waitFor({ state: 'hidden' }); assert.equal((await profile(mobile)).xp, 195);
  await noPasswordStorage(mobile);
  record('Nouvelle connexion après déconnexion : progression toujours récupérable.');
  await second.close();
  assert.deepEqual(errors, []);
  await writeFile(join(destination, 'browser-validation.json'), JSON.stringify({ passed: true, at: new Date().toISOString(), scope: 'Serveur privé, stockage temporaire, deux contextes Chromium indépendants ; petit écran simulé, aucun téléphone physique.', checks, captures, errors, evidence }, null, 2) + '\n');
  console.log(`Accounts browser: ${checks.length}/${checks.length} checks passed.`);
} finally {
  await browser.close(); await gameServer.gracefullyShutdown(false);
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
}
