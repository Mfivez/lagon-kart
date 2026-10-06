import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';

type Status = { running: boolean; track: string; lap: number; selected: 'lap1' | 'lap2'; url: string;
  status: string; currentTime: number; duration: number; paused: boolean; volume: number;
  elementCount: number; activeElements: number; playCount: number; loadCount: number; error: unknown };
type Native = { calls: { play: number; pause: number; load: number; peakActive: number };
  elements: Array<{ id: number; url: string; paused: boolean; currentTime: number; duration: number;
    readyState: number; loop: boolean; ended: boolean; error: number | null }> };
type Decoded = { url: string; bytes: number; seconds: number; sampleRate: number; channels: number;
  samples: number; peak: number; rms: number; nonFinite: number };
type Harness = { status(): Status; native(): Native; set(id: string, active: boolean, volume?: number, lap?: number): void;
  frames(count: number): void; hidden(hidden: boolean): void; seekNearEnd(): { duration: number; position: number }; decode(url: string): Promise<Decoded> };
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const reports = resolve(project, 'test-results');
await mkdir(reports, { recursive: true });
const vite = await createServer({ configFile: false, root: project, publicDir: resolve(project, 'client/public'),
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true } });
await vite.listen(); const address = vite.httpServer!.address(); assert.ok(address && typeof address !== 'string');
const origin = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
const errors: string[] = []; const requests: Array<{ url: string; range?: string }> = [];
const checks: string[] = []; const lifecycle: Array<{ stage: string; status: Status; native: Native }> = [];
const decoded: Array<Decoded & { sha256: string; sourceSha256: string }> = [];
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
const status = (page: Page) => page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.status());
const native = (page: Page) => page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.native());
const musicRequests = () => requests.filter(request => /\.mp3(?:$|\?)/i.test(request.url) && !request.url.includes('validation=decode'));
async function capture(page: Page, stage: string) {
  const state = { stage, status: await status(page), native: await native(page) }; lifecycle.push(state);
  assert.ok(state.native.elements.length <= 2, 'at most two native media elements');
  assert.ok(state.native.calls.peakActive <= 1, 'at most one native element playing at a time');
  return state;
}
async function playing(page: Page, selected: 'lap1' | 'lap2') {
  await page.waitForFunction(expected => {
    const harness = (window as unknown as { __musicTest: Harness }).__musicTest;
    const status = harness.status(); const active = harness.native().elements.filter(element => !element.paused);
    return status.running && status.selected === expected && active.length === 1 && active[0]!.readyState >= 2
      && Number.isFinite(active[0]!.duration) && active[0]!.duration > 0 && active[0]!.currentTime > .1;
  }, selected, { timeout: 20000 });
}
async function set(page: Page, id: string, active: boolean, volume = 75, lap = 0) {
  await page.evaluate(args => (window as unknown as { __musicTest: Harness }).__musicTest.set(...args),
    [id, active, volume, lap] as [string, boolean, number, number]);
}
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push({ url: request.url(), ...(request.headers().range ? { range: request.headers().range } : {}) }));
  await page.goto(origin + '/tests/fixtures/music.html'); await page.waitForFunction(() => '__musicTest' in window);
  await set(page, 'lagon', true);
  assert.equal((await status(page)).running, false);
  assert.equal(musicRequests().length, 0);
  record('Avant le geste utilisateur : silence et aucun téléchargement MP3');
  await page.click('#start'); await playing(page, 'lap1');
  const started = await capture(page, 'start-lap1');
  await page.waitForTimeout(900); const advancing = await capture(page, 'play-without-render-ticks');
  assert.ok(advancing.status.currentTime > started.status.currentTime + .4);
  assert.ok(advancing.native.elements.find(element => !element.paused)!.currentTime > started.native.elements.find(element => !element.paused)!.currentTime + .4);
  record('Après clic : MP3 décodé par le lecteur et currentTime avance sans appels de rendu');

  for (const id of ['lagon', 'canyon', 'glacier', 'neon']) {
    await set(page, id, false, 75, 0); await set(page, id, true, 75, 0); await playing(page, 'lap1');
    assert.ok((await status(page)).url.endsWith('/audio/lap-1-v1.mp3'));
    await set(page, id, true, 75, 1); await playing(page, 'lap2');
    const second = await capture(page, id + '-lap2');
    assert.ok(second.status.url.endsWith('/audio/lap-2-v1.mp3'));
    await page.waitForTimeout(350); await set(page, id, true, 75, 2);
    const third = await capture(page, id + '-lap3');
    assert.equal(third.status.track, id); assert.equal(third.status.selected, 'lap2');
    assert.ok(third.status.currentTime >= second.status.currentTime, 'third lap must not restart the second file');
    assert.equal(third.native.calls.play, second.native.calls.play);
  }
  record('Quatre circuits : Lap 1 au tour 1, Lap 2 aux tours 2 et 3 ; aucun redémarrage au troisième tour');

  const stableRequests = musicRequests().length;
  const beforeFrames = await native(page);
  await page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.frames(1200));
  await page.waitForTimeout(400);
  const afterFrames = await capture(page, '1200-render-updates');
  assert.equal(afterFrames.native.calls.play, beforeFrames.calls.play);
  assert.equal(afterFrames.native.calls.load, beforeFrames.calls.load);
  assert.equal(musicRequests().length, stableRequests);
  record('1 200 mises à jour identiques : aucun nouveau play, load ou téléchargement');

  for (const lap of [0, 1]) {
    await set(page, 'neon', true, 75, lap); await playing(page, lap === 0 ? 'lap1' : 'lap2');
    const beforeLoop = await native(page);
    assert.equal(beforeLoop.elements.find(element => !element.paused)!.loop, true);
    await page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.seekNearEnd());
    await page.waitForFunction(() => {
      const active = (window as unknown as { __musicTest: Harness }).__musicTest.native().elements.find(element => !element.paused);
      return active && active.currentTime > .02 && active.currentTime < 2;
    }, undefined, { timeout: 15000 });
    assert.equal((await native(page)).calls.play, beforeLoop.calls.play);
    await capture(page, 'native-loop-lap' + (lap + 1));
  }
  record('Les deux MP3 bouclent réellement après une recherche près de leur fin, sans nouvelle piste superposée');

  await page.waitForTimeout(450); const beforeMute = await status(page);
  await set(page, 'neon', true, 0, 1); await page.waitForTimeout(250);
  const muted = await capture(page, 'volume-zero');
  assert.equal(muted.status.running, false); assert.ok(muted.native.elements.every(element => element.paused));
  const mutedTime = muted.status.currentTime;
  await page.waitForTimeout(300); assert.ok(Math.abs((await status(page)).currentTime - mutedTime) < .05);
  await set(page, 'neon', true, 75, 1); await playing(page, 'lap2');
  assert.ok((await status(page)).currentTime >= beforeMute.currentTime);
  record('Volume zéro : pause réelle ; retour du volume : reprise à la position conservée');

  await page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.hidden(true));
  await page.waitForTimeout(250); const hidden = await capture(page, 'hidden');
  assert.equal(hidden.status.running, false); assert.ok(hidden.native.elements.every(element => element.paused));
  await page.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.hidden(false));
  await playing(page, 'lap2');
  assert.ok((await status(page)).currentTime >= hidden.status.currentTime);
  record('Visibilité simulée : pause puis reprise native sans empilement');

  await page.click('#stop'); await page.waitForTimeout(250); const stopped = await capture(page, 'race-finished');
  assert.equal(stopped.status.running, false); assert.ok(stopped.native.elements.every(element => element.paused && element.currentTime < .05));
  await set(page, 'lagon', true, 75, 0); await playing(page, 'lap1');
  const restarted = await capture(page, 'new-race-lap1');
  assert.equal(restarted.status.selected, 'lap1'); assert.ok(restarted.status.currentTime < 1);
  await page.click('#stop');
  record('Fin de course : pause et remise à zéro ; nouvelle course : retour au premier MP3');

  for (const [index, name] of ['Lap 1.mp3', 'Lap 2.mp3'].entries()) {
    const url = '/audio/lap-' + (index + 1) + '-v1.mp3';
    const metrics = await page.evaluate(url => (window as unknown as { __musicTest: Harness }).__musicTest.decode(url), url);
    assert.equal(metrics.nonFinite, 0); assert.ok(metrics.samples > 10000 && metrics.seconds > 1);
    assert.ok(metrics.channels >= 1 && metrics.channels <= 2 && metrics.sampleRate >= 8000);
    assert.ok(metrics.peak > .01 && metrics.rms > .001, 'decoded MP3 contains non-silent audio');
    const source = await readFile(resolve(project, 'assets/audios', name));
    const served = await readFile(resolve(project, 'client/public' + url));
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(source), hash(served), 'served audio is the user-provided file without transformation');
    assert.equal(metrics.bytes, served.length);
    decoded.push({ ...metrics, sha256: hash(served), sourceSha256: hash(source) });
  }
  record('Décodage complet des deux fichiers fournis : données finies, signal non silencieux et SHA-256 identiques aux sources');

  const failed = await browser.newContext();
  const failedPage = await failed.newPage(); const failureRequests: string[] = [];
  failedPage.on('pageerror', error => errors.push(error.message));
  await failed.route(/\/audio\/.*\.mp3(?:$|\?)/, route => {
    failureRequests.push(route.request().url());
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Fixture: missing MP3' });
  });
  await failedPage.goto(origin + '/tests/fixtures/music.html');
  await failedPage.click('#start');
  await failedPage.waitForFunction(() => (window as unknown as { __musicTest: Harness }).__musicTest.status().status === 'error', undefined, { timeout: 15000 });
  const failure = await capture(failedPage, 'mp3-404');
  assert.equal(failure.status.running, false); assert.ok(failure.native.elements.every(element => element.paused));
  const failureCount = failureRequests.length;
  await failedPage.evaluate(() => (window as unknown as { __musicTest: Harness }).__musicTest.frames(600));
  await failedPage.waitForTimeout(400);
  assert.equal(failureRequests.length, failureCount, 'failed file is not requested every render frame');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(request => !/^https?:/.test(request.url) || new URL(request.url).origin === origin));
  record('MP3 404 : silence sans crash ni boucle de requêtes ; aucune ressource externe');
  await failed.close();
  const report = { command: 'node --import tsx scripts/music-check.ts', checks, lifecycle, decoded, requests,
    failureRequests, errors, scope: 'Real Chromium HTMLMediaElement playback plus complete Web Audio decoding on local Vite. Visibility and seek are fixture-controlled; no production Range support, physical speaker listening, phone lock, full race or public Docker mutation claimed.' };
  await writeFile(resolve(reports, 'music.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(project, 'docs/music-validation.json'), JSON.stringify(report, null, 2));
} finally { await browser.close(); await vite.close(); }
