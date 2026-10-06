import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

type Model = { modelId: string; source: string; position: number[]; bodyRotation: number[]; bodyMinimumY: number;
  wheels: Array<{ role: string; name: string; position: number[]; rotation: number[]; front: boolean }>;
  geometries: string[]; paints: string[]; colors: string[] };
type View = { asset: { status: string; loadCount: number; fallbackCount: number;
  models: Record<string, { status: string; loadCount: number; instanceCount: number }> }; karts: Model[] };
type Harness = { describe(): View; animate(): View & { inputUnchanged: boolean }; repaint(): View;
  recreate(): Promise<View & { disposedGeometry: number }>; detail(id: string): void };
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'docs/kart-library'); await mkdir(output, { recursive: true });
const vite = await createServer({ configFile: false, root, publicDir: resolve(root, 'client/public'),
  server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
await vite.listen(); const address = vite.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks: string[] = [], errors: string[] = [], requests: string[] = [];
const record = (text: string) => { checks.push(text); console.log('✓ ' + text); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(origin + '/tests/fixtures/kart-library.html');
  await page.waitForFunction(() => !!(window as unknown as { __kartLibrary?: Harness }).__kartLibrary, undefined, { timeout: 30000 });
  const initial = await page.evaluate(() => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.describe());
  assert.equal(initial.asset.status, 'ready'); assert.equal(initial.asset.loadCount, 3); assert.equal(initial.asset.fallbackCount, 0);
  assert.equal(initial.karts.length, 24);
  const glbs = requests.filter(url => url.endsWith('.glb'));
  assert.equal(glbs.length, 3); assert.equal(new Set(glbs).size, 3);
  assert.ok(requests.every(url => new URL(url).origin === origin));
  record('Trois vrais GLB chargés une seule fois chacun pour 24 instances, depuis la même origine');
  for (const id of ['zsky', 'sprint', 'retro']) {
    const karts = initial.karts.filter(kart => kart.modelId === id);
    assert.equal(karts.length, 8); assert.equal(new Set(karts.map(kart => kart.colors.join(','))).size, 8);
    for (const kart of karts) {
      assert.deepEqual(kart.geometries, karts[0]!.geometries);
      assert.equal(kart.wheels.filter(wheel => wheel.role === 'wheel-spin').length, 4);
      assert.equal(kart.wheels.filter(wheel => wheel.role === 'wheel-pivot' && wheel.front).length, 2);
      for (const other of karts) if (other !== kart) assert.ok(kart.paints.every(paint => !other.paints.includes(paint)));
    }
  }
  record('Huit peintures indépendantes par modèle et géométries partagées entre ses instances');
  await page.screenshot({ path: resolve(output, 'three-models.png') });
  for (const id of ['sprint', 'retro']) {
    await page.evaluate(id => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.detail(id), id);
    await page.screenshot({ path: resolve(output, id + '.png') });
  }
  const motion = await page.evaluate(() => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.animate());
  assert.equal(motion.inputUnchanged, true);
  for (let index = 0; index < initial.karts.length; index++) {
    const kart = motion.karts[index]!, previous = initial.karts[index]!;
    assert.deepEqual(kart.position, previous.position);
    assert.notDeepEqual(kart.bodyRotation, previous.bodyRotation);
    assert.ok(kart.bodyMinimumY >= -.0001);
    for (const wheel of kart.wheels) {
      if (wheel.role === 'wheel-spin') assert.ok(Math.abs(wheel.rotation[0]!) > .01);
      if (wheel.role === 'wheel-pivot') assert.equal(Math.abs(wheel.rotation[1]!) > .01, wheel.front);
    }
  }
  record('Les quatre roues roulent, seules les roues avant braquent, les carrosseries penchent sans modifier la simulation');
  const repaint = await page.evaluate(() => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.repaint());
  assert.notDeepEqual(repaint.karts[0]!.colors, motion.karts[0]!.colors);
  for (let index = 1; index < repaint.karts.length; index++) assert.deepEqual(repaint.karts[index]!.colors, motion.karts[index]!.colors);
  const recreated = await page.evaluate(() => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.recreate());
  assert.equal(recreated.disposedGeometry, 0); assert.equal(recreated.asset.loadCount, 3); assert.equal(recreated.karts.length, 24);
  assert.equal(requests.filter(url => url.endsWith('.glb')).length, 3);
  record('Recoloration isolée et recréation après changement de modèle sans rechargement ni destruction des buffers partagés');
  const fallbackPage = await browser.newPage();
  fallbackPage.on('pageerror', error => errors.push(error.message));
  await fallbackPage.route('**/models/kart-retro-v1.glb', route => route.abort());
  await fallbackPage.goto(origin + '/tests/fixtures/kart-library.html');
  await fallbackPage.waitForFunction(() => !!(window as unknown as { __kartLibrary?: Harness }).__kartLibrary, undefined, { timeout: 30000 });
  const fallback = await fallbackPage.evaluate(() => (window as unknown as { __kartLibrary: Harness }).__kartLibrary.describe());
  assert.equal(fallback.asset.models.retro!.status, 'failed'); assert.equal(fallback.asset.models.retro!.loadCount, 1);
  assert.equal(fallback.asset.models.zsky!.status, 'ready'); assert.equal(fallback.asset.models.sprint!.status, 'ready');
  assert.equal(fallback.asset.fallbackCount, 8);
  assert.ok(fallback.karts.filter(kart => kart.modelId === 'retro').every(kart => kart.source === 'fallback'));
  assert.deepEqual(errors, []);
  record('Échec d’un seul GLB : secours limité à ce modèle, les deux autres restent importés, aucune erreur JavaScript');
  await writeFile(resolve(output, 'validation.json'), JSON.stringify({ command: 'node --import tsx scripts/kart-library-check.ts',
    renderer: 'Chromium headless / SwiftShader', checks, errors, modelRequests: glbs, initial, motion, fallback }, null, 2) + '\n');
} finally { await browser.close(); await vite.close(); }
