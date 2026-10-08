import { homeControl } from './menu-navigation.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { createGameServer } from '../server/app.js';
import type { CustomTrackDraft } from '../shared/custom-tracks.js';

const destination = resolve('docs/editor-features'); await mkdir(destination, { recursive: true });
const previous = JSON.parse(await readFile(join(destination, 'browser-validation.json'), 'utf8')) as { passed: boolean; evidence: { saved: { draft: CustomTrackDraft } } };
assert.equal(previous.passed, true, 'Requires the successful full editor workflow first.');
const directory = await mkdtemp(join(tmpdir(), 'lagon-editor-visual-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client'));
const store = await ready;
// Declared visual fixture from the draft already created through UI in the full
// workflow. This check tests labels/layout only, not saving or driving again.
const fixture = await store.save({ id: 'visual-fixture', name: 'Atelier visuel' }, previous.evidence.saved.draft);
await gameServer.listen(0, '127.0.0.1'); const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks: string[] = [], captures: string[] = [], errors: string[] = [];
const evidence: Record<string, unknown> = { origin };
try {
  const html = await fetch(origin).then(response => response.text()); evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  for (const size of [{ width: 1280, height: 900 }, { width: 320, height: 568 }]) {
    const context = await browser.newContext({ viewport: size, isMobile: size.width === 320, hasTouch: size.width === 320, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' }); await (await homeControl(page, '#track-editor-button')).click();
    await page.locator(`[data-action="copy"][data-id="${fixture.id}"]`).click();
    const texts = await page.locator('[data-feature-marker^="events-"] text').allTextContents();
    assert.equal(texts.length, 3); assert.ok(texts.every(text => text === 'T1/T4/T5'));
    const colors = await page.locator('.editor-feature-legend > span').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, color: getComputedStyle(node, '::before').backgroundColor, width: getComputedStyle(node, '::before').width })));
    assert.deepEqual(colors.map(item => item.color), ['rgb(215, 121, 36)', 'rgb(145, 75, 189)', 'rgb(47, 134, 176)']);
    assert.ok(colors.every(item => item.width === '8px'));
    assert.equal(await page.locator('#track-editor-dialog').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
    if (size.width === 320) await page.locator('#editor-canvas').scrollIntoViewIfNeeded();
    const name = `editor-final-${size.width}x${size.height}.png`; await page.screenshot({ path: join(destination, name), timeout: 20000 }); captures.push(name);
    evidence[String(size.width)] = { badges: texts, legend: colors };
    checks.push(`${size.width}×${size.height} : trois tours lisibles sur la même zone, pastilles CSS visibles, aucun débordement.`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(destination, 'visual-validation.json'), JSON.stringify({ passed: true, timestamp: new Date().toISOString(), checks, captures, errors, evidence,
    fixture: 'Le brouillon du parcours UI complet est publié directement dans un store privé temporaire, puis ouvert normalement via Dupliquer. Contrôle visuel uniquement ; sauvegarde et simulation ne sont pas retestées ici.' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: true, checks, captures }));
} catch (error) {
  process.exitCode = 1; console.error(error);
  await writeFile(join(destination, 'visual-validation.json'), JSON.stringify({ passed: false, error: String(error), checks, captures, errors, evidence }, null, 2) + '\n');
} finally { await browser.close(); await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true }); }
