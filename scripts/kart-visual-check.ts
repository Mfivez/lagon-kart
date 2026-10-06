import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

type View = {
  mode: string; view: string; asset: { status: string; loadCount: number; url?: string; [key: string]: unknown };
  karts: Array<{ id: string; meshes: number; geometries: string[]; modelGeometries: string[]; paints: string[]; paintColors: string[];
    wheels: Array<{ role: string; rotation: number[]; position: number[] }>; bodyRotation: number[]; bodyMinY: number | null;
    shadows: number; shadowTransparent: boolean }>;
  positions: unknown[]; camera: unknown; lighting: unknown; info: unknown;
};
type Harness = { draw(): void; describe(): View; setView(view: 'lineup' | 'detail'): void; animate(): View; repaint(): View;
  clearance(): { minimum: number; roadY: number; positions: unknown[] };
  recreate(): Promise<{ released: View; restored: View; disposedShared: number }>;
  cameraTracking(): { intervalMs: number; simulationDt: number; speed: number;
    start: { x: number; z: number; angle: number }; unchanged: boolean;
    samples: Array<{ frame: number; elapsedMs: number; position: number[];
      projected: number[]; cameraPosition: number[]; goalLag: number }> } };
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const images = resolve(project, 'docs/kart-visuals');
const reports = resolve(project, 'test-results');
const baselineOnly = process.argv.includes('--baseline-only');
const cameraOnly = process.argv.includes('--camera-only');
const checks: string[] = [];
const errors: string[] = [];
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.describe());
await mkdir(images, { recursive: true }); await mkdir(reports, { recursive: true });
const vite = await createServer({ configFile: false, root: project, publicDir: resolve(project, 'client/public'),
  optimizeDeps: { include: ['three', 'three/addons/utils/BufferGeometryUtils.js', 'three/addons/loaders/GLTFLoader.js'] },
  server: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
await vite.listen();
const address = vite.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
let before: View | undefined; let after: View | undefined; let fallback: View | undefined;
let clearanceEvidence: { minimum: number; roadY: number; positions: unknown[] } | undefined;
const requests: string[] = [];
try {
  if (cameraOnly) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/tests/fixtures/kart-visual.html?model=after');
    await page.waitForFunction(() => {
      const harness = (window as unknown as { __kartVisual?: Harness }).__kartVisual;
      if (!harness) return false;
      harness.draw(); return harness.describe().asset.status === 'ready';
    }, undefined, { timeout: 20000 });
    const camera = await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.cameraTracking());
    assert.equal(camera.unchanged, true, 'rendering must not mutate the fixture world');
    const established = camera.samples.filter(sample => sample.frame >= 4);
    for (const sample of camera.samples) {
      const traveled = camera.speed * sample.elapsedMs / 1000;
      assert.ok(Math.abs(sample.position[0]! - camera.start.x - Math.sin(camera.start.angle) * traveled) < 1e-9);
      assert.ok(Math.abs(sample.position[1]! - camera.start.z - Math.cos(camera.start.angle) * traveled) < 1e-9);
    }
    for (const sample of established) {
      assert.ok(sample.projected.every(Number.isFinite));
      assert.ok(Math.abs(sample.projected[0]!) < 1 && Math.abs(sample.projected[1]!) < 1,
        'kart stays in horizontal and vertical view: ' + JSON.stringify(sample));
      assert.ok(sample.projected[2]! >= -1 && sample.projected[2]! <= 1, 'kart is inside the camera depth range');
      assert.ok(sample.goalLag < 4.5, 'chase camera follows real frame time rather than capped simulation dt: ' + sample.goalLag);
    }
    assert.deepEqual(errors, []);
    const bounds = { x: [Math.min(...established.map(sample => sample.projected[0]!)), Math.max(...established.map(sample => sample.projected[0]!))],
      y: [Math.min(...established.map(sample => sample.projected[1]!)), Math.max(...established.map(sample => sample.projected[1]!))],
      maximumGoalLag: Math.max(...established.map(sample => sample.goalLag)) };
    record('Caméra normale à 3 FPS : kart dans le champ, poursuite stable et monde physique intact');
    console.log(JSON.stringify(bounds));
    await writeFile(resolve(reports, 'kart-camera.json'), JSON.stringify({
      command: 'node --import tsx scripts/kart-visual-check.ts --camera-only',
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, camera, bounds, checks, errors }, null, 2));
    await context.close();
  } else {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/tests/fixtures/kart-visual.html?model=before');
  await page.waitForFunction(() => !!(window as unknown as { __kartVisual?: Harness }).__kartVisual);
  before = await state(page);
  assert.equal(before.karts.length, 8);
  await page.screenshot({ path: resolve(images, 'kart-before.png') });
  await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.setView('detail'));
  await page.screenshot({ path: resolve(images, 'kart-before-detail.png') });
  record('Référence procédurale capturée : huit positions, caméra et éclairage fixes');
  await context.close();

  if (!baselineOnly) {
    const current = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await current.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { requests.push(request.url()); });
    await page.goto(origin + '/tests/fixtures/kart-visual.html?model=after');
    await page.waitForFunction(() => {
      const harness = (window as unknown as { __kartVisual?: Harness }).__kartVisual;
      if (!harness) return false;
      harness.draw(); const asset = harness.describe().asset;
      return asset.status === 'ready' && Number(asset.importedCount) >= 9;
    }, undefined, { timeout: 20000 });
    after = await state(page);
    assert.deepEqual(after.camera, before.camera); assert.deepEqual(after.lighting, before.lighting);
    assert.deepEqual(after.positions, before.positions);
    assert.equal(after.asset.loadCount, 1);
    const modelRequests = requests.filter(url => /\.glb(?:$|\?)/i.test(url));
    assert.equal(modelRequests.length, 1, JSON.stringify(modelRequests));
    assert.ok(requests.every(url => !/^https?:/.test(url) || new URL(url).origin === origin));
    record('Modèle GLB chargé une seule fois ; toutes les ressources restent sur la même origine');
    assert.equal(after.karts.length, 8);
    for (const kart of after.karts) {
      assert.ok(kart.paints.length > 0, 'paint materials for kart ' + kart.id);
      assert.ok(kart.modelGeometries.length >= 6, 'imported model geometry is present');
      assert.equal(kart.wheels.filter(wheel => wheel.role === 'wheel-pivot').length, 4);
      assert.equal(kart.wheels.filter(wheel => wheel.role === 'wheel-spin').length, 4);
      assert.ok(kart.shadows > 0 && kart.shadowTransparent, 'transparent contact shadow');
    }
    const karts = after.karts;
    for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
      assert.deepEqual(karts[i]!.modelGeometries, karts[j]!.modelGeometries, 'every imported model geometry is shared');
      assert.ok(!karts[i]!.paints.some(id => karts[j]!.paints.includes(id)), 'independent paint material');
    }
    assert.equal(new Set(after.karts.map(kart => kart.paintColors.join(','))).size, 8);
    record('Huit couleurs indépendantes, géométries partagées, quatre pivots et ombres de contact');
    await page.screenshot({ path: resolve(images, 'kart-after.png') });
    await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.setView('detail'));
    await page.screenshot({ path: resolve(images, 'kart-after-detail.png') });
    record('Comparaisons avant/après capturées avec transformations strictement identiques');
    const motion = await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.animate());
    const firstBefore = after.karts[0]!.wheels;
    const firstAfter = motion.karts[0]!.wheels;
    assert.ok(firstAfter.some((wheel, i) => wheel.role === 'wheel-spin' && JSON.stringify(wheel.rotation) !== JSON.stringify(firstBefore[i]!.rotation)), 'wheels rotate while moving');
    assert.ok(firstAfter.some((wheel, i) => wheel.role === 'wheel-pivot' && JSON.stringify(wheel.rotation) !== JSON.stringify(firstBefore[i]!.rotation)), 'front wheels steer');
    assert.notDeepEqual(motion.karts[0]!.bodyRotation, after.karts[0]!.bodyRotation, 'body leans while steering');
    assert.deepEqual(motion.positions, after.positions, 'visual motion never alters authoritative kart positions');
    const repaint = await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.repaint());
    assert.notDeepEqual(repaint.karts[0]!.paintColors, after.karts[0]!.paintColors);
    for (let index = 1; index < after.karts.length; index++) assert.deepEqual(repaint.karts[index]!.paintColors, after.karts[index]!.paintColors);
    record('Roues animées, braquage, inclinaison de carrosserie et changement de couleur sans modifier les positions physiques');
    const clearance = await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.clearance());
    assert.ok(clearance.minimum >= clearance.roadY, 'body stays above road during extreme roll, pitch and braking: ' + clearance.minimum);
    assert.deepEqual(clearance.positions, repaint.positions);
    clearanceEvidence = clearance;
    record('La carrosserie reste au-dessus de la route en roulis maximal et au freinage');
    const cycle = await page.evaluate(() => (window as unknown as { __kartVisual: Harness }).__kartVisual.recreate());
    assert.equal(cycle.released.karts.length, 7); assert.equal(cycle.restored.karts.length, 8);
    assert.equal(cycle.restored.asset.loadCount, 1); assert.equal(cycle.disposedShared, 0);
    assert.deepEqual(cycle.restored.karts[7]!.modelGeometries, after.karts[7]!.modelGeometries);
    record('Départ et recréation : géométries partagées conservées et aucun second chargement du GLB');
    await current.close();

    const failed = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await failed.route(/\.glb(?:$|\?)/i, route => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Fixture: missing kart model' }));
    const fallbackPage = await failed.newPage();
    fallbackPage.on('pageerror', error => errors.push(error.message));
    await fallbackPage.goto(origin + '/tests/fixtures/kart-visual.html?model=after');
    await fallbackPage.waitForFunction(() => {
      const harness = (window as unknown as { __kartVisual?: Harness }).__kartVisual;
      if (!harness) return false;
      harness.draw(); const asset = harness.describe().asset;
      return asset.status === 'failed' && Number(asset.fallbackCount) >= 9;
    }, undefined, { timeout: 20000 });
    fallback = await state(fallbackPage);
    assert.equal(fallback.karts.length, 8); assert.ok(fallback.karts.every(kart => kart.meshes > 0));
    assert.equal(fallback.asset.loadCount, 1);
    await fallbackPage.screenshot({ path: resolve(reports, 'kart-fallback.png') });
    record('Une erreur 404 du GLB conserve huit karts de secours affichés sans nouvelle tentative en boucle');
    await failed.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(reports, 'kart-visual.json'), JSON.stringify({ baselineCommit: '51bbbab3c78cc5454124ae67682fad2fdfcd5dde',
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, fixedTimeMs: 5000, baselineOnly,
    checks, before, after, fallback, clearance: clearanceEvidence, requests, errors }, null, 2));
  if (!baselineOnly) await writeFile(resolve(images, 'comparison.json'), JSON.stringify({
    baselineCommit: '51bbbab3c78cc5454124ae67682fad2fdfcd5dde', command: 'node --import tsx scripts/kart-visual-check.ts',
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, fixedTimeMs: 5000,
    positions: before.positions, camera: before.camera, lighting: before.lighting,
    model: after!.asset, clearance: clearanceEvidence, checks, pageErrors: errors,
  }, null, 2));
  }
} finally {
  await browser.close(); await vite.close();
}
