import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

type Kart = { modelId: string; characterId: string; source: string; position: number[]; headRotation: number[];
  mouthScale: number[] | null; armRotation: number[] | null; geometryIds: string[]; paints: string[]; colors: string[];
  meshes: number; triangles: number; bodyMinimumY: number };
type View = { asset: { status: string; loadCount: number; instanceCount: number; fallbackCount: number }; karts: Kart[] };
type Harness = { describe(): View; detail(id: string, model?: string): void;
  animate(mode: 'impact' | 'victory' | 'drive', firstOnly?: boolean): View & { inputUnchanged: boolean };
  repaint(): View; recreate(): Promise<View & { disposed: number }> };
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const destination = resolve(root, 'docs/characters'); await mkdir(destination, { recursive: true });
const vite = await createServer({ configFile: false, root, publicDir: resolve(root, 'client/public'),
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await vite.listen(); const address = vite.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks: string[] = [], errors: string[] = [], modelRequests: string[] = [];
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('.glb')) modelRequests.push(request.url()); });
  await page.goto(origin + '/tests/fixtures/characters.html');
  await page.waitForFunction(() => !!(window as unknown as { __characters?: Harness }).__characters, undefined, { timeout: 45000 });
  const before = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.describe());
  assert.equal(before.asset.status, 'ready'); assert.equal(before.asset.instanceCount, 30);
  assert.equal(before.asset.loadCount, 3); assert.equal(before.asset.fallbackCount, 0);
  assert.equal(modelRequests.length, 3); assert.ok(modelRequests.every(url => new URL(url).origin === origin));
  assert.deepEqual([...new Set(before.karts.map(kart => kart.characterId))], ['racer', 'queen', 'obama', 'trump', 'kim']);
  for (const kart of before.karts) {
    const twin = before.karts.find(other => other !== kart && other.modelId === kart.modelId && other.characterId === kart.characterId)!;
    assert.deepEqual(kart.geometryIds, twin.geometryIds);
    assert.ok(kart.paints.every(paint => !twin.paints.includes(paint)));
    assert.notDeepEqual(kart.colors, twin.colors);
    assert.ok(kart.triangles < 16000); assert.ok(kart.meshes < 55);
  }
  record('Cinq personnages sur les trois modèles, 30 instances, trois GLB chargés une fois, couleurs indépendantes et géométries partagées');
  await page.screenshot({ path: resolve(destination, 'lineup.png') });
  for (const id of ['racer', 'queen', 'obama', 'trump', 'kim']) {
    await page.evaluate(id => (window as unknown as { __characters: Harness }).__characters.detail(id), id);
    await page.screenshot({ path: resolve(destination, id + '.png') });
  }
  record('Cinq captures rapprochées et vue d’ensemble produites depuis le rendu réel');
  const isolated = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.animate('impact', true));
  assert.equal(isolated.inputUnchanged, true);
  const firstQueen = before.karts.findIndex(kart => kart.characterId === 'queen');
  assert.notDeepEqual(isolated.karts[firstQueen]!.headRotation, before.karts[firstQueen]!.headRotation);
  assert.notDeepEqual(isolated.karts[firstQueen]!.mouthScale, before.karts[firstQueen]!.mouthScale);
  for (let index = 0; index < before.karts.length; index++) if (index !== firstQueen) assert.deepEqual(isolated.karts[index], before.karts[index]);
  record('Réaction à un impact isolée sur un pilote, sans modifier ses voisins ni les entrées physiques');
  const impact = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.animate('impact'));
  const victory = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.animate('victory'));
  for (let index = 0; index < before.karts.length; index++) {
    const kart = victory.karts[index]!;
    assert.deepEqual(kart.position, before.karts[index]!.position);
    assert.notDeepEqual(kart.headRotation, impact.karts[index]!.headRotation);
    assert.ok(kart.bodyMinimumY >= -.0001);
    if (kart.characterId !== 'racer') {
      assert.notDeepEqual(kart.mouthScale, impact.karts[index]!.mouthScale);
      assert.ok(Math.abs(kart.armRotation![0]!) > 1);
    }
  }
  assert.equal(victory.inputUnchanged, true);
  await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.detail('queen'));
  await page.screenshot({ path: resolve(destination, 'queen-victory.png') });
  record('Réactions d’impact et de victoire pour tous, salut des caricatures et tête du pilote casqué, trajectoires intactes');
  const recolored = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.repaint());
  assert.notDeepEqual(recolored.karts[firstQueen]!.colors, victory.karts[firstQueen]!.colors);
  for (let index = 0; index < before.karts.length; index++) if (index !== firstQueen) assert.deepEqual(recolored.karts[index]!.colors, victory.karts[index]!.colors);
  const recreated = await page.evaluate(() => (window as unknown as { __characters: Harness }).__characters.recreate());
  assert.equal(recreated.disposed, 0); assert.equal(recreated.asset.loadCount, 3); assert.equal(modelRequests.length, 3);
  assert.deepEqual(errors, []);
  record('Recoloration/recréation d’un couple pilote-kart sans perte de géométrie partagée, sans nouveau GLB ni erreur JavaScript');
  await writeFile(resolve(destination, 'validation.json'), JSON.stringify({ command: 'node --import tsx scripts/characters-check.ts',
    renderer: 'Chromium headless / SwiftShader', checks, errors, modelRequests, before, impact, victory }, null, 2) + '\n');
} finally { await browser.close(); await vite.close(); }
