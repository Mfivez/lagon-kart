import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, type Room } from 'colyseus.js';
import { neutralInput, type World, type Kart } from '../shared/game.js';
import { autopilot } from '../shared/autopilot.js';

const origin = process.env.BASE_URL || 'http://127.0.0.1:3000';
const count = Number(process.env.CLIENTS || 8);
const latency = Number(process.env.LATENCY_MS || 0);
const trackId = process.env.TRACK_ID || 'lagon';
const sdk = new Client(origin.replace(/^http/, 'ws'));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, timeout = 10000, label = 'condition') {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`); await sleep(25); }
}
type Snapshot = { world: World; tick: number; simHz: number; serverTime: number };
type Driver = { room: Room; snapshot?: Snapshot; seq: number; epoch: number; messages: number; bytes: number; items: Set<string>; timer?: ReturnType<typeof setInterval> };
const drivers: Driver[] = [];
const extraRooms: Room[] = [];
const started = Date.now();
const checks: string[] = [];
function record(message: string) { checks.push(message); console.log(`✓ ${message}`); }
function attach(room: Room): Driver {
  const driver: Driver = { room, seq: 0, epoch: -1, messages: 0, bytes: 0, items: new Set() };
  listen(driver);
  drivers.push(driver);
  return driver;
}
function listen(driver: Driver) {
  driver.room.onMessage('notice', () => {});
  driver.room.onMessage('snapshot', (value: Snapshot) => {
    driver.messages++;
    driver.bytes += JSON.stringify(value).length;
    const apply = () => {
      driver.snapshot = value;
      for (const player of value.world.players) if (player.item) driver.items.add(player.item);
      for (const object of value.world.objects) driver.items.add(object.kind);
    };
    if (latency) setTimeout(apply, latency); else apply();
  });
}
function me(driver: Driver): Kart | undefined { return driver.snapshot?.world.players.find(p => p.id === driver.room.sessionId); }
function startDriving(driver: Driver) {
  driver.timer = setInterval(() => {
    const kart = me(driver);
    if (!kart?.connected) return;
    if (driver.epoch !== kart.epoch) { driver.epoch = kart.epoch; driver.seq = Math.max(0, kart.lastSeq + 1); }
    const input = autopilot(kart, driver.seq++, true);
    const activeRoom = driver.room;
    if (latency) setTimeout(() => { if (activeRoom.connection.isOpen) activeRoom.send('input', input); }, latency);
    else activeRoom.send('input', input);
  }, 1000 / 30);
}

try {
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  const reservation = await fetch(`${origin}/matchmake/create/race`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Réservation', practice: true }) });
  const seat = await reservation.json() as { room: { publicAddress?: string } };
  assert.ok(!seat.room.publicAddress, 'No private/public advertised endpoint may override the browser origin');
  const reserved = await sdk.consumeSeatReservation(seat as never);
  reserved.onMessage('snapshot', () => {}); reserved.onMessage('notice', () => {});
  await reserved.leave();
  record('Health et réservation : aucune adresse privée annoncée');
  const first = attach(await sdk.create('race', { name: 'Pilote 1', color: '#ff6b6b', trackId }));
  for (let i = 1; i < count; i++) attach(await sdk.joinById(first.room.roomId, { name: `Pilote ${i + 1}` }));
  await until(() => drivers.every(d => d.snapshot?.world.players.length === count), 10000, 'tous les clients voient les participants');
  record(`${count} clients SDK indépendants dans le même salon`);
  if (count === 8) { await assert.rejects(sdk.joinById(first.room.roomId, { name: 'Neuvième' })); record('Neuvième joueur refusé'); }
  assert.equal((await fetch(`${origin}/room/${first.room.roomId}`)).status, 200);
  await assert.rejects(sdk.joinById('ZZZZZZ', { name: 'Inconnu' }));
  record('Lien direct servi ; salon inexistant refusé');
  const outsider = await sdk.create('race', { name: 'Autre salon', practice: true });
  outsider.onMessage('snapshot', () => {}); outsider.onMessage('notice', () => {}); extraRooms.push(outsider);
  assert.notEqual(outsider.roomId, first.room.roomId);
  record('Deux salons indépendants');
  const original = me(first)!;
  const seqBefore = original.lastSeq;
  first.room.send('input', { ...neutralInput(0, original.epoch), throttle: 999 });
  first.room.send('input', { ...neutralInput(0, original.epoch), x: 999999, lap: 3 });
  first.room.send('finish', { rank: 1, lap: 3 });
  await sleep(300 + latency * 2);
  assert.equal(me(first)!.lastSeq, seqBefore);
  assert.equal(me(first)!.finished, false);
  assert.equal(me(first)!.lap, 0);
  record('Commandes invalides, position et victoire imposées rejetées');
  for (const driver of drivers) driver.room.send('ready', { ready: true });
  await until(() => first.snapshot!.world.players.every(p => p.ready), 5000, 'prêts');
  first.room.send('start');
  await until(() => drivers.every(d => d.snapshot?.world.phase === 'racing'), 10000, 'décompte synchronisé');
  for (const driver of drivers) startDriving(driver);
  await sleep(3500);
  assert.ok(me(first)!.speed > 0);
  const id = first.room.sessionId;
  const token = first.room.reconnectionToken;
  const epoch = me(first)!.epoch;
  const progress = me(first)!.progress;
  clearInterval(first.timer);
  await first.room.leave(false);
  await sleep(400);
  first.room = await sdk.reconnect(token);
  first.snapshot = undefined;
  listen(first);
  await until(() => Boolean(me(first)?.connected), 5000, 'reconnexion');
  assert.equal(first.room.sessionId, id);
  assert.notEqual(first.room.reconnectionToken, token);
  assert.ok(me(first)!.epoch > epoch);
  assert.ok(me(first)!.progress >= progress - 5);
  assert.equal(first.snapshot!.world.players.length, count);
  first.room.send('input', { ...neutralInput(100, epoch), throttle: 1 });
  await sleep(200 + latency * 2);
  assert.equal(me(first)!.lastSeq, -1);
  record('Reconnexion : session et progression conservées, jeton renouvelé, ancienne epoch rejetée');
  startDriving(first);
  const raceStarted = Date.now();
  let nextLog = Date.now();
  await until(() => {
    if (Date.now() > nextLog) {
      nextLog = Date.now() + 10000;
      console.log('Course', first.snapshot?.world.players.map(p => `${p.name}: tour ${p.lap}, ${p.progress.toFixed(0)} m`).join(' / '));
    }
    return drivers.every(d => d.snapshot?.world.phase === 'finished');
  }, 160000, 'course complète');
  for (const driver of drivers) clearInterval(driver.timer);
  const result = first.snapshot!.world.players.filter(p => !p.spectator).sort((a, b) => a.rank - b.rank).map(p => [p.id, p.rank, p.finished, p.lap]);
  for (const driver of drivers) assert.deepEqual(driver.snapshot!.world.players.filter(p => !p.spectator).sort((a, b) => a.rank - b.rank).map(p => [p.id, p.rank, p.finished, p.lap]), result);
  assert.ok(first.snapshot!.world.players.every(p => p.finished && p.lap === 3), 'Every bot must complete three laps');
  record('Course complète : trois tours et classement identique sur tous les clients');
  const items = new Set(drivers.flatMap(d => [...d.items]));
  assert.ok(items.has('turbo') && items.has('trap') && items.has('projectile'), 'Three item kinds observed');
  record('Turbo, piège et projectile observés sur les clients');
  const host = drivers.find(d => d.room.sessionId === first.snapshot!.world.hostId)!;
  host.room.send('rematch');
  await until(() => drivers.every(d => d.snapshot?.world.phase === 'lobby'), 5000, 'revanche');
  assert.ok(first.snapshot!.world.players.every(p => !p.finished && p.lap === 0 && p.item === '' && !p.ready));
  record('Revanche : tours, objets, résultats et état prêt réinitialisés');
  const hostId = host.room.sessionId;
  await host.room.leave();
  const remaining = drivers.find(d => d !== host)!;
  await until(() => remaining.snapshot!.world.hostId !== hostId, 5000, 'transfert hôte');
  record('Transfert du rôle hôte');
  const report = { origin, trackId, clients: count, kind: 'simulated SDK clients', simulatedOneWayLatencyMs: latency, checks,
    durationSeconds: (Date.now() - started) / 1000, raceSeconds: (Date.now() - raceStarted) / 1000,
    receivedSnapshots: drivers.map(d => d.messages), approximateJsonBytesPerClient: drivers.map(d => d.bytes), result };
  await mkdir('test-results', { recursive: true });
  await writeFile(process.env.REPORT_PATH || 'test-results/network.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const driver of drivers) { clearInterval(driver.timer); if (driver.room.connection.isOpen) await driver.room.leave(); }
  for (const room of extraRooms) if (room.connection.isOpen) await room.leave();
}
