import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import type { PlayerProfile } from '../shared/progression.js';
import type { World } from '../shared/game.js';

const origin = process.env.BASE_URL;
if (!origin || !/^https:\/\//.test(origin)) throw new Error('BASE_URL HTTPS requis pour cette vérification publique explicite.');
const report = resolve(process.env.REPORT_PATH ?? 'docs/accounts/public-validation.json');
await mkdir(dirname(report), { recursive: true });
const username = `TestCompte_${Date.now().toString(36)}`;
const password = randomBytes(20).toString('base64url');
const errors: string[] = [], checks: string[] = [];
const evidence: Record<string, unknown> = {};
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const record = (label: string) => { checks.push(label); console.log('✓ ' + label); };
let joinedPage: Page | undefined;
async function ready(page: Page) {
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`Ressource HTTP ${response.status()}`); });
  await page.goto(origin!, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug: unknown }).__lagonDebug);
}
async function credentials(page: Page, signup: boolean) {
  await page.locator('#account-username').fill(username); await page.locator('#account-password').fill(password);
  if (signup) await page.locator('#account-confirm').fill(password);
  await page.locator('#account-submit').click(); await page.locator('#account-dialog').waitFor({ state: 'hidden' });
}
async function profile(page: Page): Promise<PlayerProfile> {
  return await page.evaluate(async () => {
    const result = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lagon-player-token') } });
    if (!result.ok) throw Error(`Profil HTTP ${result.status}`);
    return (await result.json()).profile;
  });
}
try {
  const first = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const desktop = await first.newPage(); await ready(desktop);
  evidence.clientAssets = await desktop.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')));
  await desktop.locator('#name-input').fill('Test comptes');
  await desktop.locator('[data-account="register"]').click(); await credentials(desktop, true);
  const registered = await profile(desktop); assert.equal(registered.username, username); assert.equal(registered.xp, 0);
  record('Inscription via le vrai formulaire HTTPS et son Origin navigateur ; un compte de test sans XP fictifs est enregistré.');
  await first.close();

  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const mobile = await second.newPage(); await ready(mobile);
  assert.equal(await mobile.evaluate(() => localStorage.getItem('lagon-player-token')), null);
  await mobile.locator('[data-account="login"]').click(); await credentials(mobile, false);
  const recovered = await profile(mobile);
  assert.equal(recovered.id, registered.id); assert.equal(recovered.name, registered.name); assert.equal(recovered.xp, 0);
  record('Connexion sur un second contexte mobile vierge : même pilote retrouvé, sans transfert de stockage navigateur.');

  await mobile.locator('#create-button').click(); joinedPage = mobile;
  await mobile.locator('#lobby-panel').waitFor({ state: 'visible' });
  const kart = await mobile.evaluate(() => {
    const debug = (window as unknown as { __lagonDebug: { sessionId: string; world: World } }).__lagonDebug;
    return debug.world.players.find(player => player.id === debug.sessionId)!;
  });
  assert.equal(kart.playerId, recovered.id); assert.equal(kart.careerLevel, recovered.careerLevel);
  assert.equal(kart.name, registered.name);
  record('Salon Colyseus réel à travers le tunnel : le kart utilise l’identité authentifiée récupérée.');
  await mobile.locator('#leave-button').click(); await mobile.locator('#home-panel').waitFor({ state: 'visible' }); joinedPage = undefined;
  await mobile.locator('[data-account="logout"]').click();
  await mobile.waitForFunction(() => !localStorage.getItem('lagon-player-token'));
  assert.equal(await mobile.evaluate(() => sessionStorage.getItem('lagon-session')), null);
  record('Sortie du salon et déconnexion ; aucun salon de test laissé actif ni reconnexion locale conservée.');
  await second.close(); assert.deepEqual(errors, []);
  await writeFile(report, JSON.stringify({ passed: true, at: new Date().toISOString(), origin,
    scope: 'Deux contextes Chromium indépendants, HTTPS/tunnel public, mobile simulé, aucun téléphone physique. Un compte de test vide conservé dans le volume ; aucune progression falsifiée.',
    checks, evidence, errors }, null, 2) + '\n');
  console.log(`Public accounts: ${checks.length}/${checks.length} checks passed.`);
} finally {
  if (joinedPage && !joinedPage.isClosed()) {
    try { await joinedPage.locator('#leave-button').click({ timeout: 5000 }); } catch { /* Socket closure still releases this test client. */ }
  }
  await browser.close();
}
