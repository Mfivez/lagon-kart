import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import type { World } from '../shared/game.js';

// UI integration on a private test server. The server fixture finishes each
// race after real keyboard movement; test:tournament covers complete races.
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address();
assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
type Debug = { world: World | null; sessionId: string; fps: number };
const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const errors: string[] = [];
const checks: string[] = [];
const schedule = ['lagon', 'canyon', 'glacier', 'neon'];
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
async function phase(page: Page, value: string) {
  await page.waitForFunction(expected => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.phase === expected, value, { timeout: 20000 });
}
try {
  await mkdir('test-results', { recursive: true });
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1024, height: 768 } }), browser.newContext({ viewport: { width: 800, height: 700 } })]);
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  await host.goto(origin);
  await host.locator('#create-button').waitFor();
  assert.equal(await host.locator('[data-track]').count(), 4);
  for (const track of schedule) {
    await host.locator(`[data-track="${track}"]`).click();
    await host.waitForTimeout(500);
  }
  await host.screenshot({ path: 'test-results/tournament-home.png' });
  record('Quatre choix de circuits et aperçus sur l’accueil');
  await host.locator('#name-input').fill('Camille');
  await host.locator('#create-button').click(); await phase(host, 'lobby');
  assert.equal((await debug(host)).world!.trackId, 'neon');
  const link = await host.locator('#share-url').inputValue();
  await guest.goto(link);
  await guest.locator('#name-input').fill('Sacha');
  await guest.locator('#join-button').click(); await phase(guest, 'lobby');
  const roomId = new URL(link).pathname.split('/').pop()!;
  const live = matchMaker.getLocalRoomById(roomId) as RaceRoom;
  assert.ok(live);
  await host.locator('#race-configuration').evaluate(element => { if (element instanceof HTMLDetailsElement) element.open = true; });
  await host.locator('#mode-select').selectOption('tournament');
  await host.locator('#count-select').selectOption('4');
  await host.locator('#selection-select').selectOption('manual');
  for (let index = 0; index < schedule.length; index++) await host.locator(`[data-schedule-index="${index}"]`).selectOption(schedule[index]);
  await host.locator('#configure-button').click();
  await host.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.tournament.schedule.join() === 'lagon,canyon,glacier,neon');
  await guest.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.tournament.mode === 'tournament');
  assert.equal(await guest.locator('#configure-button:visible:enabled').count(), 0);
  await host.screenshot({ path: 'test-results/tournament-lobby.png' });
  record('Hôte : programme manuel ; invité : programme reçu sans permission de modification');

  for (let round = 0; round < schedule.length; round++) {
    await Promise.all([phase(host, 'lobby'), phase(guest, 'lobby')]);
    const state = await debug(host);
    assert.equal(state.world!.trackId, schedule[round]);
    assert.equal(state.world!.tournament.raceIndex, round);
    await guest.locator('#ready-button').click();
    await host.locator('#ready-button').click();
    await host.locator('#start-button').click();
    await Promise.all([phase(host, 'racing'), phase(guest, 'racing')]);
    await host.keyboard.down('ArrowUp'); await host.waitForTimeout(1500); await host.keyboard.up('ArrowUp');
    assert.ok((await debug(guest)).world!.players.some(player => player.speed > 0.5));
    await host.screenshot({ path: `test-results/tournament-${schedule[round]}.png` });
    // Finish on the private server only, to inspect every intermission and the
    // final podium without duplicating the four full SDK races in a slow GPU.
    live.world.players.forEach((kart, index) => { kart.finished = true; kart.lap = 3; kart.finishTime = 60 + index * 5; });
    await Promise.all([phase(host, 'finished'), phase(guest, 'finished')]);
    await host.locator('#cup-standings').waitFor({ state: 'visible' });
    assert.equal((await debug(host)).world!.tournament.rounds.length, round + 1);
    if (round < schedule.length - 1) {
      await host.locator('#next-race-button').click();
      record(`${schedule[round]} : conduite, rendu, points et bouton de manche suivante`);
    } else {
      await host.screenshot({ path: 'test-results/tournament-podium.png' });
      assert.equal((await debug(host)).world!.tournament.completed, true);
      await host.locator('#rematch-button').click();
      record('Podium final et nouveau tournoi depuis l’interface');
    }
  }
  await phase(host, 'lobby');
  assert.ok((await debug(host)).world!.tournament.standings.every(entry => entry.points === 0));
  await host.locator('#race-configuration').evaluate(element => { if (element instanceof HTMLDetailsElement) element.open = true; });
  await host.locator('#selection-select').selectOption('random');
  await host.locator('#count-select').selectOption('8');
  assert.equal(await host.locator('#count-select').inputValue(), '8');
  for (const track of schedule) await host.locator(`[data-pool-track="${track}"]`).setChecked(track === 'canyon' || track === 'glacier');
  assert.equal(await host.locator('#count-select').inputValue(), '8', 'Les cases de circuits doivent conserver le nombre de courses choisi');
  await host.locator('#configure-button').click();
  await Promise.all([host, guest].map(page => page.waitForFunction(() => {
    const cup = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.tournament;
    return cup?.selection === 'random' && cup.raceCount === 8;
  })));
  const random = (await debug(host)).world!.tournament;
  assert.equal(random.schedule.length, 8);
  assert.ok(random.schedule.every(track => ['canyon', 'glacier'].includes(track)));
  record('Mode aléatoire : huit courses parmi les deux circuits cochés');
  assert.deepEqual(errors, []);
  record('Aucune erreur JavaScript pendant les changements de circuit et de tournoi');
  await writeFile('test-results/browser-tournament.json', JSON.stringify({ origin, checks, errors,
    raceCompletion: 'Private server fixtures; keyboard movement tested on each track. Full races covered by test:tournament.',
    renderer: 'Chromium headless / SwiftShader', randomSchedule: random.schedule }, null, 2));
  await Promise.all([host, guest].map(page => page.locator('#leave-button').click()));
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world === null)));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await gameServer.gracefullyShutdown(false);
}
