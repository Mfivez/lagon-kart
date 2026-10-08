import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { Client, type Room } from 'colyseus.js';
import { createGameServer } from '../server/app.js';
import { CUSTOM_TRACK_TEMPLATES, type StoredCustomTrack } from '../shared/custom-tracks.js';
import { getTrack, trackElevation } from '../shared/track.js';
import { autopilot } from '../shared/autopilot.js';
import type { World } from '../shared/game.js';

const destination = resolve(process.env.REPORT_DIR ?? 'docs/multilevel-tracks/visual');
await mkdir(destination, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-crossing-visual-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players'); process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const { gameServer, httpServer, ready } = createGameServer(resolve('dist/client'));
await ready; await gameServer.listen(0, '127.0.0.1');
const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
const origin = `http://127.0.0.1:${address.port}`, errors: string[] = [], captures: unknown[] = [];
const peers: Array<{ room: Room; world?: World; seq: number; epoch: number }> = [];
let browser: Browser | undefined, timer: ReturnType<typeof setInterval> | undefined;
let passed = false, failure: string | undefined;
const report: Record<string, unknown> = { origin, startedAt: new Date().toISOString(), scope: 'Temporary private server. Two SDK drivers use normal inputs; Chromium joins through the UI as a spectator. No race state injection.' };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, message: string, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!await check()) { if (Date.now() > deadline) throw Error(message); await pause(75); }
}
function attach(room: Room) {
  const peer = { room, seq: 0, epoch: -1, world: undefined as World | undefined }; peers.push(peer);
  room.onMessage('snapshot', ({ world, tracks }: { world: World; tracks?: StoredCustomTrack[] }) => {
    peer.world = world; if (tracks?.length) room.send('tracksReady', { ids: tracks.map(track => track.runtimeId ?? `${track.id}-v${track.revision}`) });
  });
  room.onMessage('notice', () => {}); room.onError((code, message) => errors.push(`${code}: ${message}`)); return peer;
}
try {
  const identity = await fetch(origin + '/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validation ponts visuels' }) }).then(r => r.json()) as { token: string };
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES.find(template => template.id === 'figure-eight')!.draft); draft.lapCount = 1;
  const response = await fetch(origin + '/api/tracks', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + identity.token }, body: JSON.stringify({ draft }) });
  assert.equal(response.status, 201);
  const saved = (await response.json() as { track: StoredCustomTrack }).track, track = getTrack(saved.runtimeId);
  const crossing = track.crossings![0]!; report.crossing = crossing;
  const host = attach(await new Client(origin.replace(/^http/, 'ws')).create('race', { name: 'Pilote pont', trackId: track.id }));
  attach(await new Client(origin.replace(/^http/, 'ws')).joinById(host.room.roomId, { name: 'Pilote tunnel' }));
  await until(() => peers.every(peer => peer.world?.players.length === 2), 'Two SDK drivers joined');
  for (const peer of peers) peer.room.send('ready', { ready: true });
  await until(() => host.world!.players.every(kart => kart.ready), 'Drivers ready');
  host.room.send('start'); await until(() => host.world?.phase === 'racing', 'Normal race started');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => { localStorage.setItem('lagon-volume', '0'); localStorage.setItem('lagon-graphics-quality', 'smooth'); });
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.locator('#name-input').fill('Observateur ponts');
  await page.locator('#code-input').fill(host.room.roomId); await page.locator('#join-button').click();
  await until(() => host.world!.players.some(kart => kart.spectator && kart.connected), 'Browser joined as spectator');
  const cdp = await context.newCDPSession(page);
  const targets = [
    { name: 'tunnel-approach.png', progress: crossing.lowerStart - 30 },
    { name: 'inside-tunnel.png', progress: crossing.lowerProgress },
    { name: 'on-upper-road.png', progress: crossing.upperProgress },
  ];
  let targetIndex = 0, captureBrake = false;
  timer = setInterval(() => {
    const leader = host.world?.players.find(kart => kart.id === host.room.sessionId);
    const target = targets[targetIndex];
    const progress = leader?.routeProgress ?? leader?.progress ?? -Infinity;
    if (leader && target && progress >= target.progress - 14 && progress <= target.progress + 30) captureBrake = true;
    for (const peer of peers) {
      const kart = peer.world?.players.find(kart => kart.id === peer.room.sessionId);
      if (!kart || kart.finished || peer.world?.phase !== 'racing') continue;
      if (kart.epoch !== peer.epoch) { peer.epoch = kart.epoch; peer.seq = Math.max(0, kart.lastSeq + 1); }
      const input = autopilot(kart, peer.seq++, false);
      // Ordinary braking keeps the observed scene stable while SwiftShader
      // captures a frame. No clock, position, altitude or simulation is changed.
      peer.room.send('input', captureBrake ? { ...input, throttle: 0, steer: 0, brake: true, reset: false, use: false } : input);
    }
  }, 1000 / 30);
  for (const target of targets) {
    await until(() => { const kart = host.world!.players.find(k => k.id === host.room.sessionId)!;
      return captureBrake && Math.abs(kart.speed) < .05;
    }, target.name + ' reached by driving', 100000);
    await pause(300);
    const state = await page.evaluate(() => {
      const debug = (window as unknown as { __lagonDebug: { world: World; view: unknown; sessionId: string } }).__lagonDebug;
      const kart = debug.world.players.find(kart => !kart.spectator)!;
      return { practice: debug.world.practice, trackId: debug.world.trackId, raceTime: debug.world.raceTime,
        spectators: debug.world.players.filter(k => k.spectator).length, kart, view: debug.view };
    });
    report.lastObservation = state;
    assert.equal(state.practice, false); assert.equal(state.trackId, track.id);
    assert.ok(Math.abs((state.kart.routeProgress ?? state.kart.progress) - target.progress) < 30, 'Capture is on the requested route segment');
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: false });
    await writeFile(join(destination, target.name), Buffer.from(png.data, 'base64'));
    const ground = trackElevation(state.kart.routeProgress ?? state.kart.progress, track.id);
    const view = state.view as { camera: { position: number[] }; tracked: { position: number[] } };
    assert.ok(Math.abs(view.tracked.position[1]! - state.kart.elevation) < .25);
    if (target.name === 'inside-tunnel.png') assert.ok(view.camera.position[1]! <= ground + 3.15, 'Camera stays beneath tunnel roof');
    captures.push({ name: target.name, raceTime: state.raceTime, progress: state.kart.routeProgress, elevation: state.kart.elevation, ground, camera: view.camera, spectators: state.spectators });
    console.log('Captured ' + target.name);
    targetIndex++; captureBrake = false;
  }
  await until(() => host.world!.phase === 'finished', 'Drivers finish their normal race', 100000);
  report.results = host.world!.players.filter(k => !k.spectator).map(k => ({ name: k.name, lap: k.lap, finished: k.finished, finishTime: k.finishTime }));
  assert.ok(host.world!.players.filter(k => !k.spectator).every(k => k.finished && k.lap === 1));
  assert.deepEqual(errors, []); passed = true;
} catch (error) { failure = String(error); process.exitCode = 1; console.error(error); }
finally {
  clearInterval(timer); await browser?.close();
  for (const peer of peers) if (peer.room.connection.isOpen) await peer.room.leave().catch(() => {});
  await gameServer.gracefullyShutdown(false); await rm(directory, { recursive: true, force: true });
  await writeFile(join(destination, 'validation.json'), JSON.stringify({ ...report, passed, failure, captures, errors, finishedAt: new Date().toISOString(), remaining: ['No physical mobile device or Safari tested.', 'This browser scenario covers the figure-eight template; three floors are covered by geometry and physics tests.'] }, null, 2) + '\n');
}
