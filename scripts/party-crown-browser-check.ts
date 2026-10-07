/** Real 90 s Crown match, two browser profiles, actual 8 s vote and replay.
 * BASE_URL enables a public smoke without server fixtures. Identities are reused
 * from an origin-bound /tmp journal; production circuits are never modified. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { World } from '../shared/game.js';
import type { PlayerProfile, ReplayData } from '../shared/progression.js';
import type { RaceRoom } from '../server/RaceRoom.js';

const external = process.env.BASE_URL?.replace(/\/$/, '');
const output = resolve(process.env.REPORT_DIR || 'docs/party-crown'); await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-party-browser-'));
const checks: string[] = [], errors: string[] = [], captures: string[] = [];
const evidence: Record<string, unknown> = { startedAt: new Date().toISOString(), checks, errors, captures, external: !!external };
let origin = external ?? '', browser: Browser | undefined, shutdown: (() => Promise<unknown>) | undefined;
let host: Page | undefined, guest: Page | undefined;
let privateRoom: ((id: string) => RaceRoom) | undefined;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const record = (message: string) => { checks.push(message); console.log('✓ ' + message); };
async function until(predicate: () => Promise<boolean>, label: string, timeout = 35000) {
  const end = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > end) throw Error(label); await pause(150); }
}
type Debug = { world: World | null; sessionId: string | null; connected: boolean };
async function state(page: Page): Promise<Debug> {
  return page.evaluate(() => { const debug = (window as unknown as { __lagonDebug: Debug }).__lagonDebug; return { world: debug.world, sessionId: debug.sessionId, connected: debug.connected }; });
}
async function request(path: string, token?: string, body?: unknown) {
  const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`${path}: HTTP ${response.status}`); return response.json();
}
type Identity = { token: string; profile: PlayerProfile };
async function identities(): Promise<Identity[]> {
  const journal = process.env.IDENTITY_FILE || '/tmp/lagon-party-public-identities.json';
  let saved: Identity[] = [];
  if (external) {
    try { const prior = JSON.parse(await readFile(journal, 'utf8')) as { origin: string; identities: Identity[] }; if (prior.origin === origin) saved = prior.identities; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  for (let index = 0; index < 2; index++) {
    if (saved[index]) saved[index]!.profile = (await request('/api/me', saved[index]!.token)).profile as PlayerProfile;
    else {
      saved[index] = await request('/api/profile', undefined, { name: `Démo Couronne ${index + 1}` }) as Identity;
      if (external) await writeFile(journal, JSON.stringify({ origin, identities: saved }, null, 2), { mode: 0o600 });
    }
  }
  return saved;
}
async function prepare(context: BrowserContext, identity: Identity): Promise<Page> {
  await context.addInitScript(({ origin, token, name }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('lagon-player-token', token); localStorage.setItem('lagon-name', name); localStorage.setItem('lagon-volume', '0');
  }, { origin, token: identity.token, name: identity.profile.name });
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => !!(window as unknown as { __lagonDebug?: unknown }).__lagonDebug); return page;
}
async function capture(page: Page, name: string) { await page.screenshot({ path: join(output, name), timeout: 20000 }); captures.push(name); }
async function leave(page: Page | undefined) {
  if (!page || page.isClosed()) return;
  if (await page.locator('#leave-button').isVisible().catch(() => false)) {
    await page.locator('#leave-button').click({ timeout: 5000 }).catch(() => {});
    await until(async () => !(await state(page)).world, 'Leave acknowledged', 8000).catch(() => {});
  }
}
try {
  if (!external) {
    process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
    const { createGameServer } = await import('../server/app.js'), { matchMaker } = await import('@colyseus/core');
    const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client')); await ready; await gameServer.listen(0, '127.0.0.1');
    shutdown = () => gameServer.gracefullyShutdown(false);
    const address = httpServer.address(); assert.ok(address && typeof address !== 'string'); origin = `http://127.0.0.1:${address.port}`;
    privateRoom = id => matchMaker.getLocalRoomById(id) as RaceRoom;
  }
  evidence.origin = origin; evidence.healthBefore = await request('/healthz');
  const html = await fetch(origin).then(response => response.text()); evidence.clientAssets = [...html.matchAll(/(?:src|href)="([^"]*assets[^"]+)"/g)].map(match => match[1]);
  const profiles = await identities(); evidence.profileIds = profiles.map(identity => identity.profile.id);
  const before = profiles.map(identity => ({ xp: identity.profile.xp, mmr: identity.profile.mmr, stats: identity.profile.stats }));
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-dev-shm-usage'] });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 850 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const mobile = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await mobile.addInitScript(() => { const actual = Date.now.bind(Date); Date.now = () => actual() + 60000; });
  evidence.mobileClockSkewMs = 60000;
  host = await prepare(desktop, profiles[0]!); guest = await prepare(mobile, profiles[1]!);
  await host.locator('#create-button').click(); await until(async () => (await state(host!)).world?.phase === 'lobby', 'Host lobby');
  const roomId = (await host.locator('#room-code').innerText()).trim(); evidence.roomId = roomId;
  await guest.locator('#code-input').fill(roomId); await guest.locator('#join-button').tap();
  await until(async () => (await state(host!)).world?.players.length === 2, 'Two players in the same lobby');
  await host.locator('#party-lobby summary').click(); await host.locator('#party-enabled').check(); await host.locator('#party-crown').check();
  for (const [index, id] of ['lagon', 'neon', 'canyon'].entries()) await host.locator(`[data-party-choice="${index}"]`).selectOption(id);
  await until(async () => await host!.locator('#ready-button').isDisabled(), 'Unapplied fun configuration blocks readiness');
  await host.locator('#cpu-select').selectOption('1');
  await until(async () => (await state(host!)).world?.players.some(player => player.cpu) === true, 'CPU setting applied independently');
  assert.equal(await host.locator('#party-crown').isChecked(), true); assert.equal(await host.locator('#party-enabled').isChecked(), true);
  await host.locator('#cpu-select').selectOption('0'); await until(async () => (await state(host!)).world?.players.length === 2, 'CPU removed');
  await host.locator('#party-apply').click(); await until(async () => {
    const worlds = [(await state(host!)).world, (await state(guest!)).world];
    evidence.appliedModes = worlds.map(world => ({ crown: !!world?.crown, party: !!world?.party, tournament: world?.tournament }));
    return worlds.every(world => !!world?.crown && !!world.party && world.tournament.raceCount === 4);
  }, 'Modes and four-round programme received by both players');
  assert.equal((await state(host)).world!.tournament.raceCount, 4);
  await guest.locator('#party-lobby summary').tap();
  assert.equal(await guest.locator('#party-apply').isDisabled(), true);
  assert.equal(await guest.locator('#party-lobby').evaluate(node => node.scrollWidth > node.clientWidth + 1), false);
  await guest.locator('#party-crown').scrollIntoViewIfNeeded(); await capture(guest, 'party-options-mobile-320.png');
  record('Deux profils ; brouillon Soirée/Couronne conservé pendant le changement CPU, départ bloqué avant Appliquer, commandes hôte et mobile 320 px.');
  await host.locator('#ready-button').click(); await guest.locator('#ready-button').tap();
  await until(async () => await host!.locator('#start-button').isEnabled(), 'Both players ready'); await host.locator('#start-button').click();
  await until(async () => (await state(host!)).world?.phase === 'racing', 'Natural countdown finished'); const started = Date.now();
  await host.keyboard.down('ArrowUp');
  await until(async () => ((await state(host!)).world?.raceTime ?? 0) >= 6, 'Six real seconds of racing');
  if (privateRoom) {
    const world = privateRoom(roomId).world, holder = world.players.find(kart => kart.id === world.crown!.holderId)!, attacker = world.players.find(kart => kart.id !== holder.id)!;
    world.objects.push({ id: 'browser-declared-trap', kind: 'trap', x: holder.x, z: holder.z, owner: attacker.id, angle: 0, ttl: 3 });
    await until(async () => ((await state(host!)).world?.crown?.transfers ?? 0) >= 1, 'A real trap impact transfers Crown');
    evidence.fixture = 'Serveur privé : un piège placé au porteur après 6 s ; impact, protection, transfert et fait marquant calculés par la simulation. Aucune modification d’horloge, de résultat, de vote ou de replay.';
  }
  await host.keyboard.up('ArrowUp'); await capture(host, 'crown-race-desktop.png'); await capture(guest, 'crown-race-mobile-320.png');
  assert.match(await guest.locator('#crown-status').innerText(), /s.*pts/);
  await until(async () => (await state(host!)).world?.phase === 'finished', 'Full 90-second Crown match', 115000);
  const finished = (await state(host)).world!; evidence.finish = { wallSeconds: (Date.now() - started) / 1000, raceTime: finished.raceTime, scores: finished.crown!.scores, highlights: finished.highlights };
  assert.ok(finished.raceTime >= 89.99 && finished.raceTime <= 90.1); assert.equal(finished.players.filter(player => !player.cpu).every(player => player.finished), true);
  await host.locator('[data-vote="neon"]').click(); await guest.locator('[data-vote="neon"]').tap();
  await until(async () => Object.values((await state(host!)).world?.party?.votes ?? {}).filter(value => value === 'neon').length === 2, 'Both actual ballots received');
  const countdown = Number.parseInt(await guest.locator('#party-vote-time').innerText(), 10);
  assert.ok(countdown > 0 && countdown <= 8, 'A mobile clock 60 s ahead must still show server vote time');
  await capture(guest, 'party-vote-mobile-320.png');
  await until(async () => (await state(host!)).world?.phase === 'lobby' && (await state(guest!)).world?.tournament.raceIndex === 1, 'Actual eight-second vote transitions into ready lobby');
  const next = (await state(host)).world!; assert.equal(next.trackId, 'neon'); assert.equal(next.tournament.raceCount, 4); assert.equal(next.tournament.rounds.length, 1);
  assert.equal(next.players.every(player => !player.ready), true); assert.equal((await host.locator('#room-code').innerText()).trim(), roomId);
  record('Couronne jouée pendant les vraies 90 s ; deux pilotes toujours actifs ; vote réel de 8 s, piste choisie, points et quatre manches conservés dans le même salon.');
  await until(async () => !!(await state(host!)).world?.party?.lastReplayId, 'Replay persisted');
  const replayId = (await state(host)).world!.party!.lastReplayId!, replay = (await request(`/api/replays/${replayId}`)).replay as ReplayData;
  assert.equal(replay.mode, 'crown'); assert.equal(replay.drivers.length, 2); assert.equal(replay.durationMs, 90000);
  if (privateRoom) assert.equal(replay.highlights?.some(moment => moment.kind === 'crown'), true);
  for (const [index, identity] of profiles.entries()) {
    const profile = (await request('/api/me', identity.token)).profile as PlayerProfile;
    assert.deepEqual({ xp: profile.xp, mmr: profile.mmr, stats: profile.stats }, before[index]);
  }
  evidence.replay = { id: replay.id, durationMs: replay.durationMs, highlights: replay.highlights, drivers: replay.drivers.map(driver => driver.name) };
  const moment = host.locator('#party-lobby [data-replay]').first(); const timeMs = Number(await moment.getAttribute('data-at'));
  await moment.click(); await host.locator('.replay-dialog').waitFor();
  await host.locator('.replay-dialog [data-play]').click(); const position = Number(await host.locator('.replay-dialog input').inputValue());
  assert.ok(position >= timeMs && position < timeMs + 5000); await capture(host, 'party-replay-desktop.png'); await host.locator('.replay-dialog [data-close]').click();
  let link = `${origin}/?replay=${encodeURIComponent(replayId)}&t=${Math.max(4000, timeMs)}`;
  const share = host.locator('#party-lobby [data-share]').first();
  if (await share.count()) { await share.click(); link = await host.evaluate(() => navigator.clipboard.readText()); assert.equal(new URL(link).searchParams.get('t'), String(timeMs)); }
  await host.locator('#ready-button').click(); await guest.locator('#ready-button').tap(); await until(async () => await host!.locator('#start-button').isEnabled(), 'Next normal Ready gate');
  await host.locator('#start-button').click(); await until(async () => (await state(guest!)).world?.phase === 'racing', 'Second real departure');
  assert.equal((await state(guest)).world?.trackId, 'neon');
  await leave(guest); await leave(host); await guest.close();
  await host.goto(link, { waitUntil: 'domcontentloaded' }); await host.locator('.replay-dialog').waitFor(); await host.locator('.replay-dialog [data-play]').click();
  const sharedTime = Number(new URL(link).searchParams.get('t'));
  assert.ok(Number(await host.locator('.replay-dialog input').inputValue()) >= sharedTime);
  record(`Replay réel à deux pilotes, ${privateRoom ? 'moment mesuré et ' : ''}lien horodaté ; aucun XP/MMR/record ajouté ; prochain départ normal puis fermeture du salon.`);
  await host.locator('.replay-dialog [data-close]').click(); await host.close();
  if (!external) await until(async () => (await request('/healthz')).rooms === 0, 'Private rooms disposed');
  else {
    await until(async () => { const presence = await request('/api/presence'); return !presence.players.some((player: { id: string; status: string }) => profiles.some(identity => identity.profile.id === player.id) && ['lobby', 'racing', 'results'].includes(player.status)); }, 'Test profiles left the public room');
    // Other colleagues may open rooms during a public smoke. Only our two
    // profiles must leave; the global room count is recorded without mutation.
  }
  evidence.healthAfter = await request('/healthz'); assert.deepEqual(errors, []); evidence.passed = true;
} catch (error) { evidence.passed = false; evidence.error = String(error); process.exitCode = 1; console.error(error); }
finally {
  await leave(guest); await leave(host); await browser?.close(); await shutdown?.(); await rm(directory, { recursive: true, force: true });
  evidence.finishedAt = new Date().toISOString(); await writeFile(join(output, 'browser-validation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ passed: evidence.passed, checks: checks.length, captures, browserClosed: true }));
}
