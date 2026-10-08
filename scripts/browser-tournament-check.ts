import { homeControl, readOfficialTrackCatalog, selectHomeTrack } from './menu-navigation.js';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { matchMaker } from '@colyseus/core';
import type { RaceRoom } from '../server/RaceRoom.js';
import type { World } from '../shared/game.js';
import { TRACK_IDS, getTrack } from '../shared/track.js';

// Browser/Colyseus transitions, not eight fully driven races. Each round starts
// normally and receives real keyboard input before a private finish fixture.
// Both stores are isolated: the running demo and its data are never accessed.
const directory = await mkdtemp(join(tmpdir(), 'lagon-tournament-browser-'));
const previousDirectories = { players: process.env.PLAYER_DATA_DIR, tracks: process.env.CUSTOM_TRACK_DATA_DIR };
process.env.PLAYER_DATA_DIR = join(directory, 'players');
process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const destination = resolve('docs/tournament-fix');
await mkdir(destination, { recursive: true });
const { createGameServer } = await import('../server/app.js');
const { playerStore } = await import('../server/career.js');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client'));
type Debug = { world: World | null; sessionId: string; fps: number };
const debug = (page: Page): Promise<Debug> => page.evaluate(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug);
const errors: string[] = [], checks: string[] = [], captures: string[] = [];
const rounds: Array<{ race: number; trackId: string; movement: number; results: number; completed: boolean; nextButton: boolean }> = [];
const evidence: Record<string, unknown> = {};
const record = (message: string) => { checks.push(message); console.log(`✓ ${message}`); };
let browser: Browser | undefined, host: Page | undefined;
let passed = false, failure: string | undefined;
async function phase(page: Page, value: string) {
  await page.waitForFunction(expected => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.phase === expected, value, { timeout: 30000 });
}
async function capture(page: Page, filename: string) {
  await page.screenshot({ path: join(destination, filename) }); captures.push(filename);
}
async function assertManualDraft(page: Page, schedule: string[]) {
  assert.equal(await page.locator('#mode-select').inputValue(), 'tournament');
  assert.equal(await page.locator('#count-select').inputValue(), String(schedule.length), 'Les réglages secondaires doivent conserver les huit courses du brouillon.');
  for (let index = 0; index < schedule.length; index++) assert.equal(await page.locator(`[data-schedule-index="${index}"]`).inputValue(), schedule[index]);
}
try {
  await ready;
  await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  evidence.origin = origin;
  const html = await fetch(origin).then(response => response.text());
  evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1024, height: 768 } }), browser.newContext({ viewport: { width: 800, height: 700 } })]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  host = pages[0]; const guest = pages[1];
  for (const [index, page] of pages.entries()) {
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(`${index === 0 ? 'hôte' : 'invité'} : ${error.message}`));
    page.on('response', response => {
      if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
  }
  await host.goto(origin, { waitUntil: 'domcontentloaded' });
  await host.locator('#create-button').waitFor();
  const catalog = await readOfficialTrackCatalog(host);
  assert.deepEqual(new Set(catalog), new Set(TRACK_IDS), 'Le catalogue isolé doit contenir tous les circuits intégrés.');
  const schedule = catalog.slice(0, 8); assert.equal(schedule.length, 8);
  evidence.catalog = catalog; evidence.manualSchedule = schedule;
  await selectHomeTrack(host, schedule[0]!, getTrack(schedule[0]).name);
  record(`${catalog.length} circuits disponibles : le contrôle utilise le catalogue actuel.`);
  await (await homeControl(host, '#name-input')).fill('Camille');
  await (await homeControl(host, '#create-button')).click(); await phase(host, 'lobby');
  const link = await host.locator('#share-url').inputValue();
  await guest.goto(link, { waitUntil: 'domcontentloaded' });
  await (await homeControl(guest, '#name-input')).fill('Sacha');
  await (await homeControl(guest, '#join-button')).click(); await phase(guest, 'lobby');
  const roomId = new URL(link).pathname.split('/').pop()!;
  const live = matchMaker.getLocalRoomById(roomId) as RaceRoom; assert.ok(live);
  await host.locator('#race-configuration').evaluate(element => { if (element instanceof HTMLDetailsElement) element.open = true; });
  await host.locator('#mode-select').selectOption('tournament');
  await host.locator('#count-select').selectOption('8');
  await host.locator('#selection-select').selectOption('manual');
  for (let index = 0; index < schedule.length; index++) await host.locator(`[data-schedule-index="${index}"]`).selectOption(schedule[index]);

  // Reproduction: edit eight rounds, then change settings that receive server
  // snapshots, before applying the schedule. These must not erase the draft.
  await host.locator('#cpu-select').selectOption('2');
  await host.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.players.filter(kart => kart.cpu).length === 2);
  await assertManualDraft(host, schedule);
  await host.locator('#events-select').selectOption('0');
  await host.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.eventLevel === 0);
  await assertManualDraft(host, schedule);
  await host.locator('#teams-select').selectOption('teams');
  await host.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.teamMode === true);
  await assertManualDraft(host, schedule);
  await host.locator('#count-select').scrollIntoViewIfNeeded();
  await capture(host, 'draft-eight-after-teams.png');
  record('Brouillon de huit courses conservé après modification des CPU, des événements et du mode équipes.');
  await host.locator('#configure-button').click();
  await Promise.all(pages.map(page => page.waitForFunction(expected => {
    const cup = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.tournament;
    return cup?.mode === 'tournament' && cup.raceCount === 8 && cup.schedule.join() === expected.join();
  }, schedule)));
  assert.equal(await guest.locator('#configure-button:visible:enabled').count(), 0);
  assert.equal((await debug(host)).world!.players.filter(kart => kart.cpu).length, 6);
  await host.locator('#count-select').scrollIntoViewIfNeeded();
  await capture(host, 'lobby-eight-races.png');
  record('Programme de huit courses reçu dans deux navigateurs ; deux humains et six CPU en équipes.');

  for (let round = 0; round < schedule.length; round++) {
    await Promise.all(pages.map(page => phase(page, 'lobby')));
    for (const page of pages) {
      const world = (await debug(page)).world!;
      assert.equal(world.trackId, schedule[round]); assert.equal(world.tournament.raceIndex, round);
      assert.equal(world.tournament.raceCount, 8); assert.deepEqual(world.tournament.schedule, schedule);
    }
    await guest.locator('#ready-button').click(); await host.locator('#ready-button').click();
    await host.locator('#start-button').click();
    await Promise.all(pages.map(page => phase(page, 'racing')));
    const state = await debug(host), before = state.world!.players.find(kart => kart.id === state.sessionId)!;
    await host.keyboard.down('ArrowUp');
    try {
      await guest.waitForFunction(hostId => {
        const world = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world;
        return (world?.players.find(kart => kart.id === hostId)?.speed ?? 0) > 0.5;
      }, state.sessionId);
      await host.waitForTimeout(1500);
    } finally { await host.keyboard.up('ArrowUp'); }
    const after = (await debug(guest)).world!.players.find(kart => kart.id === state.sessionId)!;
    const movement = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(movement > 1, `Course ${round + 1} : déplacement clavier vu par l’invité (${movement.toFixed(2)} m).`);
    if ([0, 2, 7].includes(round)) await capture(host, `race-${round + 1}-${schedule[round]}.png`);

    // Explicit fixture: these three laps were not driven. All transitions,
    // scoring, network messages and buttons still use the real application.
    live.world.players.forEach((kart, index) => {
      kart.finished = true; kart.lap = 3;
      kart.finishTime = Math.max(0.1, live.world.raceTime - (live.world.players.length - index) * 0.02);
    });
    await Promise.all(pages.map(page => phase(page, 'finished')));
    await host.locator('#cup-standings').waitFor({ state: 'visible' });
    const cup: World['tournament'] = (await debug(host)).world!.tournament;
    assert.equal(cup.rounds.length, round + 1); assert.equal(cup.completed, round === 7);
    assert.deepEqual((await debug(guest)).world!.tournament, cup);
    const nextButton = await host.locator('#next-race-button').isVisible();
    assert.equal(nextButton, round < 7);
    rounds.push({ race: round + 1, trackId: schedule[round], movement: Number(movement.toFixed(2)), results: cup.rounds.length, completed: cup.completed, nextButton });
    if (round < schedule.length - 1) {
      assert.equal(await host.locator('#rematch-button').isVisible(), false);
      if (round === 1) {
        await host.locator('#next-race-button').scrollIntoViewIfNeeded();
        await capture(host, 'after-race-two-next-course.png');
      }
      await host.locator('#next-race-button').click();
      await Promise.all(pages.map(page => page.waitForFunction(expected => {
        const world = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world;
        return world?.phase === 'lobby' && world.tournament.raceIndex === expected;
      }, round + 1)));
      record(`Course ${round + 1}/8 : départ, commande clavier et transition vers la course ${round + 2} dans les deux navigateurs.`);
    } else {
      assert.equal(await host.locator('#rematch-button').isVisible(), true);
      await host.locator('#results-title').scrollIntoViewIfNeeded();
      await capture(host, 'podium-eight-races.png');
      await host.locator('#rematch-button').click();
      record('Course 8/8 : podium final, huit résultats et bouton de revanche.');
    }
  }
  await Promise.all(pages.map(page => phase(page, 'lobby')));
  for (const page of pages) {
    const cup = (await debug(page)).world!.tournament;
    assert.equal(cup.raceCount, 8); assert.equal(cup.raceIndex, 0); assert.equal(cup.rounds.length, 0);
    assert.ok(cup.standings.every(entry => entry.points === 0));
  }
  record('La revanche conserve huit courses et remet les points à zéro pour les deux pilotes.');
  await host.locator('#race-configuration').evaluate(element => { if (element instanceof HTMLDetailsElement) element.open = true; });
  await host.locator('#selection-select').selectOption('random');
  await host.locator('#count-select').selectOption('8');
  const pool = [catalog[1], catalog[2]];
  assert.equal(await host.locator('[data-pool-track]').count(), catalog.length);
  for (const track of catalog) await host.locator(`[data-pool-track="${track}"]`).setChecked(pool.includes(track));
  assert.equal(await host.locator('#count-select').inputValue(), '8', 'Les cases doivent conserver le nombre de courses choisi.');
  await host.locator('#configure-button').click();
  await Promise.all(pages.map(page => page.waitForFunction(() => {
    const cup = (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world?.tournament;
    return cup?.selection === 'random' && cup.raceCount === 8;
  })));
  const random = (await debug(host)).world!.tournament;
  assert.equal(random.schedule.length, 8); assert.deepEqual(new Set(random.trackPool), new Set(pool));
  assert.ok(random.schedule.every(track => pool.includes(track)));
  assert.deepEqual((await debug(guest)).world!.tournament.schedule, random.schedule);
  evidence.randomPool = pool; evidence.randomSchedule = random.schedule;
  await capture(host, 'random-eight-two-circuits.png');
  record(`Tirage de huit courses limité aux deux circuits cochés parmi ${catalog.length}, identique pour l’invité.`);
  const store = await playerStore();
  await store.flush();
  const saved = store.listReplays();
  assert.equal(saved.length, 8, 'Les huit arrivées synthétiques doivent aussi produire huit replays valides dans le stockage privé.');
  assert.deepEqual(new Set(saved.map(replay => replay.trackId)), new Set(schedule));
  for (const replay of saved) assert.ok(await store.getReplay(replay.id));
  evidence.privateFixtureReplays = saved.length;
  record('Huit replays synthétiques valides sauvegardés puis relus dans le stockage privé.');
  assert.deepEqual(errors, []); record('Aucune erreur JavaScript ou ressource graphique/audio manquante.');
  await Promise.all(pages.map(page => page.locator('#leave-button').click()));
  await Promise.all(pages.map(page => page.waitForFunction(() => (window as unknown as { __lagonDebug: Debug }).__lagonDebug.world === null)));
  passed = true;
} catch (error) {
  failure = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(error); process.exitCode = 1;
  if (host && !host.isClosed()) await capture(host, 'failure.png').catch(() => {});
} finally {
  await writeFile(join(destination, 'browser-transitions.json'), JSON.stringify({ passed, at: new Date().toISOString(), checks, captures, errors, failure,
    scope: 'Deux contextes Chromium indépendants et un vrai serveur HTTP/Colyseus privé. Stockages joueurs et circuits temporaires sous /tmp ; aucune donnée du jeu public utilisée.',
    raceCompletion: 'Arrivées et temps de classement imposés sur le serveur privé après départ normal et déplacement clavier de chaque manche ; les temps synthétiques restent inférieurs à la durée écoulée. Vérifie les transitions, le score, les interfaces et la sauvegarde de ces fixtures ; ne valide pas huit courses complètes ni le comptage réel de tous les tours.',
    renderer: 'Chromium headless / SwiftShader', rounds, evidence }, null, 2) + '\n');
  await browser?.close(); await gameServer.gracefullyShutdown(false);
  await (await playerStore()).flush();
  if (previousDirectories.players === undefined) delete process.env.PLAYER_DATA_DIR; else process.env.PLAYER_DATA_DIR = previousDirectories.players;
  if (previousDirectories.tracks === undefined) delete process.env.CUSTOM_TRACK_DATA_DIR; else process.env.CUSTOM_TRACK_DATA_DIR = previousDirectories.tracks;
  await rm(directory, { recursive: true, force: true });
}
