/** Read-only public UI smoke: existing test identity, no profile/room/track writes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { homeControl, readOfficialTrackCatalog, selectHomeTrack } from './menu-navigation.js';

const origin = process.env.PUBLIC_ORIGIN ?? '';
assert.ok(origin.startsWith('https://'), 'PUBLIC_ORIGIN must be the running HTTPS tunnel');
const saved = JSON.parse(await readFile(process.env.TEST_IDENTITIES_FILE ?? '/tmp/lagon-ux-public-identities.json', 'utf8'));
assert.equal(saved.origin, origin, 'Reuse only the test identity belonging to this origin');
const identity = saved.identities[0] as { token: string; profile: { name: string } };
const output = resolve(process.env.REPORT_DIR ?? 'docs/home-navigation/public'); await mkdir(output, { recursive: true });
const health = await fetch(origin + '/healthz').then(response => response.json());
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
const errors: string[] = [], checks: string[] = [], captures: string[] = [];
const report: Record<string, unknown> = { origin, startedAt: new Date().toISOString(), healthBefore: health, checks, errors, captures,
  scope: 'Read-only public HTTPS home and track selection. Existing test identity; presence POST answered with actual GET snapshot. All other API mutations blocked. No public game or ranking changed.' };
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width === 320, hasTouch: viewport.width === 320 });
    await context.addInitScript(({ token, name, expectedOrigin }) => {
      if (location.origin !== expectedOrigin) return;
      localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name);
      localStorage.setItem('lagon-volume', '0'); localStorage.setItem('lagon-graphics-quality', 'smooth');
    }, { token: identity.token, name: identity.profile.name, expectedOrigin: origin });
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'GET') { await route.continue(); return; }
      if (new URL(route.request().url()).pathname === '/api/presence') {
        const response = await context.request.get(origin + '/api/presence');
        await route.fulfill({ response }); return;
      }
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Public UI verification is read-only.' }) });
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#home-ranked-action').waitFor({ state: 'visible' });
    await page.waitForFunction(() => /MMR/.test(document.querySelector('[data-ranked-mmr]')?.textContent ?? ''));
    assert.equal(await page.locator('.home-hub-body').evaluate(node => node.scrollHeight > node.clientHeight + 1), false);
    const capture = async (name: string) => {
      const cdp = await context.newCDPSession(page);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try { const data = await Promise.race([cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false }), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Capture timed out')), 20000); })]); await writeFile(join(output, name), Buffer.from(data.data, 'base64')); captures.push(name); }
      finally { clearTimeout(deadline); await cdp.detach(); }
    };
    await capture(`home-${viewport.width}.png`);
    const officialTracks = await readOfficialTrackCatalog(page);
    assert.equal(officialTracks.length, 12); assert.ok(officialTracks.includes('canyon'));
    await selectHomeTrack(page, 'canyon', 'Canyon solaire');
    assert.equal(await page.locator('#track-name').innerText(), 'Canyon solaire');
    assert.equal(await (await homeControl(page, '#graphics-quality')).count(), 1);
    await homeControl(page, '#create-button'); assert.equal(await page.locator('#track-name').innerText(), 'Canyon solaire');
    checks.push(`Public ${viewport.width}×${viewport.height}: actual grade/MMR, no home scroll, catalogue search/confirmation, unique settings and retained selection.`);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.close();
  }
  assert.deepEqual(errors, []); report.passed = true;
} catch (error) { report.passed = false; report.error = String(error); process.exitCode = 1; console.error(error); }
finally {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await browser.close(); report.finishedAt = new Date().toISOString();
  report.healthAfter = await fetch(origin + '/healthz').then(response => response.json());
  await writeFile(join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks, errors, captures }));
}
