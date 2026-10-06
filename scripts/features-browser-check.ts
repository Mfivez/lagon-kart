import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../server/app.js';
import { playerStore } from '../server/career.js';
import type { RaceRoom } from '../server/RaceRoom.js';
import { CHAMPIONSHIPS, type PlayerProfile } from '../shared/progression.js';
import type { World } from '../shared/game.js';

// Private application server + real built client. Never accepts BASE_URL and
// never touches Docker, public rooms or the persistent demo player directory.
// Ordinary UI and keyboard controls drive both human clients. Only the final
// finishing order and later career tiers use explicit local server fixtures.
const dataDirectory = await mkdtemp(join(tmpdir(), 'lagon-feature-browser-'));
const previousDirectory = process.env.PLAYER_DATA_DIR;
process.env.PLAYER_DATA_DIR = dataDirectory;
const destination = resolve('docs/feature-demo'); await mkdir(destination, { recursive: true });
const { gameServer, httpServer } = createGameServer(resolve('dist/client'));
await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
type Diagnostics = { sessionId: string | null; connected: boolean; world: World | null;
  kartAssets: { status: string; fallbackCount: number; loadCount: number;
    models: Record<string, { status: string; loadCount: number; importedCount: number; characters: string[] }> } };
const checks: string[] = [], errors: string[] = [], fixtures: string[] = [];
const captures: string[] = [], pages: Page[] = [];
const evidence: Record<string, unknown> = {};
const record = (text: string) => { checks.push(text); console.log('✓ ' + text); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>, label: string, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > end) throw new Error('Délai dépassé : ' + label); await pause(100); }
}
const state = (page: Page): Promise<Diagnostics> => page.evaluate(() => (window as unknown as { __lagonDebug: Diagnostics }).__lagonDebug);
async function ready(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: Diagnostics }).__lagonDebug, undefined, { timeout: 45000 });
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: join(destination, name + '.png'), fullPage: true }); captures.push(name + '.png');
}
async function phase(page: Page, expected: World['phase']) {
  await page.waitForFunction(expected => (window as unknown as { __lagonDebug: Diagnostics }).__lagonDebug.world?.phase === expected,
    expected, { timeout: 45000 });
}
async function profile(page: Page): Promise<PlayerProfile> {
  return page.evaluate(async () => {
    const response = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('lagon-player-token') } });
    if (!response.ok) throw new Error('Profile HTTP ' + response.status);
    return (await response.json()).profile;
  });
}
function ownRoom(id: string): RaceRoom {
  const live = matchMaker.getLocalRoomById(id) as RaceRoom;
  assert.ok(live, 'fixtures are only permitted on our local test room'); return live;
}
async function startRound(host: Page, humans: Page[]) {
  for (const page of humans) {
    const current = await state(page);
    if (!current.world!.players.find(player => player.id === current.sessionId)!.ready) await page.locator('#ready-button').click();
  }
  await until(async () => (await state(host)).world!.players.filter(player => !player.spectator).every(player => player.ready), 'tous les pilotes prêts');
  await host.locator('#start-button').click();
  await Promise.all(humans.map(page => phase(page, 'racing')));
}
async function stageFinish(live: RaceRoom, hostId: string, label: string) {
  // Freeze nobody: the ordinary server tick records the staged final result.
  const ordered = [...live.world.players].sort((a, b) => Number(b.id === hostId) - Number(a.id === hostId) || Number(a.cpu) - Number(b.cpu));
  const time = Math.max(1, live.world.raceTime);
  ordered.forEach((kart, index) => Object.assign(kart, { finished: true, lap: 3, speed: 0, rank: index + 1,
    finishTime: time + index * .05, progress: 100000 - index }));
  live.world.raceTime = time + .5; live.world.phase = 'finished';
  fixtures.push(`${label}: résultats imposés dans le serveur privé après un départ normal ; tous les pilotes finissent, l’hôte premier. Aucune course complète réellement parcourue.`);
  await until(() => live.world.tournament.rounds.length > live.world.tournament.raceIndex || live.world.tournament.mode === 'single', label + ' enregistré');
}
async function leave(page: Page) {
  if ((await state(page)).world) {
    await page.locator('#leave-button').click();
    await page.waitForFunction(() => (window as unknown as { __lagonDebug: Diagnostics }).__lagonDebug.world === null);
  }
}
async function openCareer(page: Page) {
  await page.locator('#career-button').click(); await page.locator('#career-dialog').waitFor({ state: 'visible' });
}
try {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(25000); pages.push(page);
    page.on('pageerror', error => errors.push(`client ${index + 1}: ${error.message}`));
    page.on('response', response => {
      if (/\/(assets|models|audio)\//.test(response.url()) && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    await page.goto(origin); await ready(page);
  }
  const [host, guest] = pages as [Page, Page];
  assert.equal(await host.locator('#track-cards [data-track]').count(), 6);
  assert.equal(await host.locator('#swatches [data-color]').count(), 8);
  evidence.trackIds = await host.locator('#track-cards [data-track]').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).dataset.track));
  for (const trackId of ['mangrove', 'dunes', 'lagon']) {
    await host.locator(`#track-cards [data-track="${trackId}"]`).click();
    assert.equal(await host.locator(`#track-cards [data-track="${trackId}"]`).getAttribute('aria-pressed'), 'true');
  }
  await capture(host, 'home-six-tracks');
  record('Accueil : six circuits sélectionnables, dont Mangrove et Dunes, et huit couleurs');

  const choices = [{ name: 'Démo Reine', model: 'sprint', character: 'queen', colorIndex: 1 },
    { name: 'Démo Obama', model: 'retro', character: 'obama', colorIndex: 2 }];
  for (const [index, page] of pages.entries()) {
    const choice = choices[index]!;
    await page.locator('#name-input').fill(choice.name);
    await page.locator('#swatches [data-color]').nth(choice.colorIndex).click();
    await page.locator('#garage-button').click(); await page.locator('#garage-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#kart-model-select option').count(), 3);
    assert.equal(await page.locator('#character-select option').count(), 5);
    assert.equal(await page.locator('#garage-dialog [data-slot]').count(), 6);
    assert.equal(await page.locator('#garage-dialog [data-slot] option:disabled').count(), 12);
    await page.locator('#kart-model-select').selectOption(choice.model);
    await page.locator('#character-select').selectOption(choice.character);
    await until(async () => (await state(page)).kartAssets.models[choice.model]?.characters.includes(choice.character) === true, 'aperçu 3D du garage');
    assert.equal((await profile(page)).careerLevel, 0);
    if (index === 0) await capture(page, 'garage-level-zero');
    await page.locator('#garage-close').click();
  }
  evidence.identities = await Promise.all(pages.map(page => profile(page).then(value => ({ id: value.id, name: value.name, careerLevel: value.careerLevel }))));
  record('Garage : trois modèles, cinq personnages, six catégories et douze pièces verrouillées au niveau zéro ; aperçus 3D et identités distinctes');

  await host.locator('#create-button').click(); await phase(host, 'lobby');
  const invitation = await host.locator('#share-url').inputValue();
  const roomId = new URL(invitation).pathname.split('/').pop()!;
  await guest.locator('#code-input').fill(roomId); await guest.locator('#join-button').click(); await phase(guest, 'lobby');
  await until(async () => (await state(host)).world?.players.length === 2, 'deux humains');
  for (const page of pages) {
    await until(async () => {
      const view = await state(page);
      return view.world!.players.some(kart => kart.modelId === 'sprint' && kart.characterId === 'queen')
        && view.world!.players.some(kart => kart.modelId === 'retro' && kart.characterId === 'obama')
        && view.kartAssets.models.sprint?.characters.includes('queen') === true
        && view.kartAssets.models.retro?.characters.includes('obama') === true;
    }, 'choix visibles dans les deux rendus');
    assert.equal((await state(page)).kartAssets.fallbackCount, 0);
    const list = await page.locator('#player-list').innerText();
    assert.match(list, /Sprint.*La Reine/s); assert.match(list, /Rétro.*Obama/s);
  }
  await capture(host, 'lobby-two-humans');
  record('Deux contextes indépendants rejoignent le même salon ; chacun reçoit et rend les modèles/personnages de l’autre');

  await host.locator('#lobby-garage-button').click();
  await host.locator('#kart-model-select').selectOption('zsky'); await host.locator('#character-select').selectOption('trump');
  await host.locator('#garage-close').click();
  const beforeReload = await state(host), profileBeforeReload = await profile(host);
  await until(async () => (await state(guest)).world!.players.some(kart => kart.id === beforeReload.sessionId && kart.modelId === 'zsky' && kart.characterId === 'trump'), 'modification propagée');
  await host.reload(); await ready(host);
  await until(async () => { const view = await state(host); return view.connected && view.world?.phase === 'lobby'; }, 'reconnexion après rechargement');
  const afterReload = await state(host);
  assert.equal(afterReload.sessionId, beforeReload.sessionId);
  assert.equal(afterReload.world!.players.length, 2);
  const restored = afterReload.world!.players.find(kart => kart.id === afterReload.sessionId)!;
  assert.equal(restored.modelId, 'zsky'); assert.equal(restored.characterId, 'trump');
  assert.equal(restored.name, 'Démo Reine');
  assert.equal((await profile(host)).id, profileBeforeReload.id);
  await host.locator('#lobby-garage-button').click();
  assert.equal(await host.locator('#kart-model-select').inputValue(), 'zsky');
  assert.equal(await host.locator('#character-select').inputValue(), 'trump');
  await host.locator('#garage-close').click();
  evidence.reconnection = { sessionPreserved: true, profilePreserved: true, modelId: restored.modelId, characterId: restored.characterId };
  record('Changement de kart/personnage synchronisé en salon ; rechargement avec même place, identité, choix et préférences du garage');

  // A temporarily disconnected host deliberately hands authority to the peer.
  // Resume the UI checks through whoever currently owns the room.
  const controller = afterReload.world!.hostId === afterReload.sessionId ? host : guest;
  const follower = controller === host ? guest : host;
  evidence.hostTransfer = { transferredOnReload: controller === guest };
  await controller.locator('#cpu-select').selectOption('2');
  await until(async () => (await state(host)).world!.players.filter(kart => kart.cpu).length === 2, 'deux CPU configurés');
  await controller.locator('#teams-select').selectOption('teams');
  await until(async () => { const world = (await state(host)).world!; return world.teamMode && world.players.length === 8; }, 'équipes complètes');
  await controller.locator('#events-select').selectOption('1');
  await until(async () => (await state(host)).world!.eventLevel === 1, 'niveau événements 1');
  await controller.locator('#events-select').selectOption('3');
  await until(async () => (await state(guest)).world!.eventLevel === 3, 'niveau événements 3 partagé');
  const teamWorld = (await state(host)).world!;
  assert.equal(teamWorld.players.filter(kart => kart.team === 0).length, 4);
  assert.equal(teamWorld.players.filter(kart => kart.team === 1).length, 4);
  assert.equal(teamWorld.players.filter(kart => kart.cpu).length, 6);
  assert.equal(teamWorld.tournament.mode, 'tournament'); assert.equal(teamWorld.tournament.raceCount, 2);
  assert.equal(await follower.locator('#configuration-controls').isVisible(), false);
  await capture(controller, 'teams-eight-pilots');
  record('Réglages réservés à l’hôte : CPU, équipes quatre contre quatre avec six CPU, tournoi de deux manches et événements niveau trois');

  const live = ownRoom(roomId);
  await startRound(controller, pages);
  const humanIds = pages.length === 2 ? [(await state(host)).sessionId!, (await state(guest)).sessionId!] : [];
  const startPositions = humanIds.map(id => { const kart = live.world.players.find(kart => kart.id === id)!; return { id, x: kart.x, z: kart.z }; });
  for (const page of pages) await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await Promise.all(pages.map(page => page.keyboard.down('ArrowUp')));
  await until(() => startPositions.every(start => {
    const kart = live.world.players.find(kart => kart.id === start.id)!;
    return kart.speed > 2 && Math.hypot(kart.x - start.x, kart.z - start.z) > 3;
  }), 'déplacements des deux humains au clavier', 45000);
  await Promise.all(pages.map(page => page.keyboard.up('ArrowUp')));
  evidence.keyboard = startPositions.map(start => {
    const kart = live.world.players.find(kart => kart.id === start.id)!;
    return { name: kart.name, distance: Math.hypot(kart.x - start.x, kart.z - start.z), speed: kart.speed,
      lastInputSequence: kart.lastSeq, modelId: kart.modelId, characterId: kart.characterId };
  });
  await capture(host, 'race-keyboard-two-humans');
  record('Conduite réelle : les deux humains avancent via les touches du navigateur, inputs reçus par le serveur et aucun déplacement injecté');

  await stageFinish(live, humanIds[0]!, 'Tournoi équipes, manche 1');
  await Promise.all(pages.map(page => phase(page, 'finished')));
  assert.match(await host.locator('#cup-standings').innerText(), /ÉQUIPES/);
  await capture(host, 'team-results-staged');
  await controller.locator('#next-race-button').click(); await Promise.all(pages.map(page => phase(page, 'lobby')));
  for (const kart of live.world.players.filter(kart => !kart.cpu)) {
    assert.equal(kart.characterId, kart.id === humanIds[0] ? 'trump' : 'obama');
    assert.equal(kart.modelId, kart.id === humanIds[0] ? 'zsky' : 'retro');
  }
  await startRound(controller, pages); await until(() => live.world.raceTime > 1, 'échantillonnage replay manche 2');
  await stageFinish(live, humanIds[0]!, 'Tournoi équipes, manche 2');
  await phase(host, 'finished');
  assert.equal(live.world.tournament.completed, true);
  await until(async () => (await profile(host)).stats.races >= 2, 'résultats sauvegardés');
  await Promise.all(pages.map(leave));
  record('Résultats et manche suivante vérifiés avec arrivées mises en scène : scores équipes, conservation des modèles/personnages et sauvegarde de deux courses');

  await openCareer(host);
  assert.equal(await host.locator('#career-dialog [data-cup]').count(), 6);
  assert.equal(await host.locator('#career-dialog [data-cup]:not(:disabled)').count(), 1);
  await capture(host, 'career-six-cups-level-zero');
  await host.locator('#career-dialog [data-cup="discovery"]').click(); await phase(host, 'lobby');
  const cupRoomId = new URL(await host.locator('#share-url').inputValue()).pathname.split('/').pop()!;
  const cupRoom = ownRoom(cupRoomId);
  await until(() => cupRoom.world.championshipId === 'discovery', 'championnat configuré');
  assert.equal(cupRoom.world.eventLevel, 0); assert.equal(cupRoom.world.players.filter(kart => kart.cpu).length, 3);
  const cupHostId = (await state(host)).sessionId!;
  for (let round = 0; round < 2; round++) {
    await startRound(host, [host]); await until(() => cupRoom.world.raceTime > 1, 'échantillonnage championnat');
    await stageFinish(cupRoom, cupHostId, `Championnat découverte, manche ${round + 1}`);
    await phase(host, 'finished');
    if (round === 0) { await host.locator('#next-race-button').click(); await phase(host, 'lobby'); }
  }
  await until(async () => (await profile(host)).careerLevel === 1, 'niveau un attribué');
  await leave(host); await openCareer(host);
  assert.equal(await host.locator('#career-dialog [data-cup]:not(:disabled)').count(), 3);
  assert.match(await host.locator('#career-dialog [data-cup="discovery"]').innerText(), /✓/);
  await host.locator('#career-close').click();
  await host.locator('#garage-button').click(); await host.locator('#garage-dialog').waitFor({ state: 'visible' });
  assert.equal(await host.locator('#garage-dialog [data-slot] option:disabled').count(), 8);
  await host.locator('#garage-dialog [data-slot="tires"]').selectOption('allterrain');
  assert.equal(await host.locator('#garage-dialog [data-slot="tires"]').inputValue(), 'allterrain');
  await capture(host, 'garage-level-one-unlocked'); await host.locator('#garage-close').click();
  record('Coupe découverte lancée via l’interface : deux manches mises en scène, niveau un gagné, nouvelles coupes et pneus tout-terrain déverrouillés');

  const store = await playerStore(), careerPlayer = await profile(host);
  const careerLevels: { cup: string; level: number; available: number }[] = [];
  for (const cup of CHAMPIONSHIPS.filter(cup => cup.id !== 'discovery')) {
    const saved = await store.completeChampionship(careerPlayer.id, cup.id, 1, cup.tracks.length);
    fixtures.push(`Progression UI uniquement : store.completeChampionship(${cup.id}, rank=1, finishedRaces=${cup.tracks.length}) dans le stockage temporaire. Ces courses n’ont pas été parcourues.`);
    await openCareer(host);
    const available = await host.locator('#career-dialog [data-cup]:not(:disabled)').count();
    assert.equal(available, CHAMPIONSHIPS.filter(option => option.unlockLevel <= saved.careerLevel).length);
    careerLevels.push({ cup: cup.id, level: saved.careerLevel, available });
    await host.locator('#career-close').click();
  }
  evidence.progressionFixtures = careerLevels;
  await openCareer(host);
  assert.equal(await host.locator('#career-dialog [data-cup]:not(:disabled)').count(), 6);
  for (const cup of CHAMPIONSHIPS) assert.match(await host.locator(`#career-dialog [data-cup="${cup.id}"]`).innerText(), /✓/);
  await capture(host, 'career-level-three-staged');
  record('Six coupes et niveaux zéro à trois : progression des menus vérifiée, paliers supérieurs simulés uniquement dans le stockage privé');

  await host.locator('#career-dialog details').filter({ hasText: 'Mes replays' }).locator('summary').click();
  const replayButtons = host.locator('#career-dialog [data-replay]');
  assert.ok(await replayButtons.count() >= 4);
  await replayButtons.last().click(); await host.locator('.replay-dialog').waitFor({ state: 'visible' });
  const replayRange = host.locator('.replay-dialog input[type="range"]');
  await until(async () => Number(await replayRange.inputValue()) > 0, 'lecture replay');
  await host.locator('.replay-dialog [data-play]').click();
  assert.match(await host.locator('.replay-dialog [data-play]').innerText(), /Lire|Lecture|Reprendre/);
  await replayRange.focus(); await host.keyboard.press('End');
  assert.ok(Number(await replayRange.inputValue()) > 0);
  await capture(host, 'replay-private-race');
  await host.locator('.replay-dialog [data-close]').click();
  await host.reload(); await ready(host);
  const finalProfile = await profile(host);
  assert.equal(finalProfile.id, careerPlayer.id); assert.equal(finalProfile.careerLevel, 3); assert.equal(finalProfile.completedChampionships.length, 6);
  await host.locator('#garage-button').click(); await host.locator('#garage-dialog').waitFor({ state: 'visible' });
  assert.equal(await host.locator('#garage-dialog [data-slot] option:disabled').count(), 0);
  assert.equal(await host.locator('#garage-dialog [data-slot="tires"]').inputValue(), 'allterrain');
  evidence.finalProfile = finalProfile;
  record('Replay de trajectoires lu, mis en pause et parcouru ; identité, niveau et configuration restaurés après rechargement');
  assert.deepEqual(errors, []); record('Aucune erreur JavaScript ni ressource modèle/audio/asset manquante');
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ origin, checks, errors, fixtures, captures, evidence,
    scope: 'Deux contextes Chromium/SwiftShader sur le même hôte. Serveur éphémère et profils temporaires. Déplacements clavier réels ; arrivées et paliers supérieurs explicitement simulés, aucune course complète ni deux machines physiques.' }, null, 2) + '\n');
} catch (error) {
  process.exitCode = 1; // Colyseus' installed rejection handler otherwise masks failures as exit zero.
  for (const [index, page] of pages.entries()) if (!page.isClosed()) {
    await page.screenshot({ path: join(destination, `failure-client-${index + 1}.png`), fullPage: true }).catch(() => {});
  }
  await writeFile(join(destination, 'failure.json'), JSON.stringify({ checks, errors, fixtures, captures, evidence,
    failure: error instanceof Error ? error.stack : String(error), states: await Promise.all(pages.map(page => state(page).catch(() => null))) }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close(); await gameServer.gracefullyShutdown(false);
  process.env.PLAYER_DATA_DIR = previousDirectory;
  if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR;
  await rm(dataDirectory, { recursive: true, force: true });
}
