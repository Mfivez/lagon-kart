import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { neutralInput, type Kart, type World } from '../shared/game.js';
import { getTrack } from '../shared/track.js';

const origin = process.env.BASE_URL || 'http://127.0.0.1:3000';
const count = Number(process.env.CLIENTS || 4);
assert.ok(Number.isInteger(count) && count >= 2 && count <= 8);
const sdk = new Client(origin.replace(/^http/, 'ws'));
const schedule = ['lagon', 'canyon', 'glacier', 'neon'];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, label: string, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`); await sleep(30); }
}
type Driver = { room: Room; world?: World; seq: number; epoch: number; timer?: ReturnType<typeof setInterval> };
const drivers: Driver[] = [];
const extras: Room[] = [];
const checks: string[] = [];
const raceResults: unknown[] = [];
const started = Date.now();
function record(message: string) { checks.push(message); console.log(`✓ ${message}`); }
function me(driver: Driver): Kart | undefined { return driver.world?.players.find(player => player.id === driver.room.sessionId); }
function listen(driver: Driver) {
  driver.room.onMessage('snapshot', (snapshot: { world: World }) => { driver.world = snapshot.world; });
  driver.room.onMessage('notice', () => {});
}
function attach(room: Room): Driver {
  const driver: Driver = { room, seq: 0, epoch: -1 };
  drivers.push(driver); listen(driver); return driver;
}
function drive(driver: Driver) {
  driver.timer = setInterval(() => {
    const kart = me(driver);
    if (!kart || !driver.room.connection.isOpen) return;
    if (kart.epoch !== driver.epoch) { driver.epoch = kart.epoch; driver.seq = Math.max(0, kart.lastSeq + 1); }
    const input = driver.world?.phase === 'racing'
      ? autopilot(kart, driver.seq++, true)
      : { ...neutralInput(driver.seq++, kart.epoch), throttle: driver.world?.phase === 'countdown' && driver.world.countdown < 0.85 ? 1 : 0 };
    driver.room.send('input', input);
  }, 1000 / 30);
}
function host(): Driver { return drivers.find(driver => driver.room.sessionId === drivers[0]!.world?.hostId)!; }

try {
  assert.equal((await fetch(`${origin}/healthz`)).status, 200);
  const first = attach(await sdk.create('race', { name: 'Tournoi 1' }));
  for (let index = 1; index < count; index++) attach(await sdk.joinById(first.room.roomId, { name: `Tournoi ${index + 1}` }));
  await until(() => drivers.every(driver => driver.world?.players.length === count), 'participants');
  const guest = drivers[1]!;
  guest.room.send('configure', { mode: 'single', selection: 'manual', trackId: 'neon' });
  await sleep(200);
  assert.equal(first.world!.trackId, 'lagon');
  record('Configuration réservée à l’hôte');
  first.room.send('configure', { mode: 'tournament', selection: 'manual', schedule, raceCount: schedule.length });
  await until(() => drivers.every(driver => driver.world?.tournament.schedule.join() === schedule.join()), 'programme manuel partagé');
  record('Programme manuel de quatre circuits partagé par tous les clients');
  drivers.forEach(drive);

  for (let round = 0; round < schedule.length; round++) {
    await until(() => drivers.every(driver => driver.world?.phase === 'lobby' && driver.world.tournament.raceIndex === round), 'salon suivant');
    const world = first.world!;
    assert.equal(world.trackId, schedule[round]);
    assert.ok(world.players.every(player => player.trackId === world.trackId && player.lap === 0 && !player.finished && !player.ready));
    assert.equal(world.tournament.rounds.length, round);
    for (const driver of drivers) driver.room.send('ready', { ready: true });
    await until(() => host().world!.players.every(player => player.ready), 'prêts');
    host().room.send('start');
    await until(() => drivers.every(driver => driver.world?.phase === 'racing'), 'départ');
    if (round === 1) {
      await sleep(1500);
      const token = first.room.reconnectionToken;
      const id = first.room.sessionId;
      const epoch = me(first)!.epoch;
      const score = structuredClone(first.world!.tournament.standings);
      clearInterval(first.timer);
      await first.room.leave(false); await sleep(250);
      first.room = await sdk.reconnect(token); first.world = undefined; listen(first);
      await until(() => Boolean(me(first)?.connected), 'reconnexion en tournoi');
      assert.equal(first.room.sessionId, id);
      assert.ok(me(first)!.epoch > epoch);
      assert.equal(first.world!.tournament.raceIndex, round);
      assert.deepEqual(first.world!.tournament.standings, score);
      drive(first);
      record('Reconnexion en deuxième manche : identité, scores et programme conservés');
    }
    let nextLog = 0;
    await until(() => {
      if (Date.now() > nextLog) {
        nextLog = Date.now() + 15000;
        console.log(`${getTrack(schedule[round]).name} : ${first.world?.players.map(player => `${player.name} ${player.lap}/3`).join(' · ')}`);
      }
      return drivers.every(driver => driver.world?.phase === 'finished');
    }, `arrivée sur ${schedule[round]}`, 180000);
    const result = first.world!;
    assert.ok(result.players.every(player => player.finished && player.lap === 3), 'Tous les pilotes doivent finir sans imposer leur position');
    assert.equal(result.tournament.rounds.length, round + 1);
    assert.equal(result.tournament.completed, round === schedule.length - 1);
    assert.equal(result.tournament.standings.length, count);
    const pointSum = result.tournament.standings.reduce((sum, entry) => sum + entry.points, 0);
    assert.equal(pointSum, [15, 12, 10, 8, 6, 4, 2, 1].slice(0, count).reduce((a, b) => a + b) * (round + 1));
    for (const driver of drivers) assert.deepEqual(driver.world!.tournament, result.tournament);
    const stableScores = structuredClone(result.tournament.standings);
    await sleep(200);
    assert.deepEqual(first.world!.tournament.standings, stableScores, 'Les points ne sont attribués qu’une fois');
    raceResults.push({ trackId: result.trackId, length: getTrack(result.trackId).length,
      results: result.tournament.rounds[round], standings: stableScores });
    record(`${getTrack(result.trackId).name} : ${count} pilotes, trois tours, classement et points synchronisés`);
    if (round < schedule.length - 1) {
      const previousEpochs = new Map(result.players.map(player => [player.id, player.epoch]));
      const nonHost = drivers.find(driver => driver !== host())!;
      nonHost.room.send('nextRace'); await sleep(200);
      assert.equal(first.world!.phase, 'finished');
      host().room.send('nextRace');
      await until(() => first.world?.phase === 'lobby' && first.world.tournament.raceIndex === round + 1, 'manche suivante');
      assert.ok(first.world!.players.every(player => player.epoch > previousEpochs.get(player.id)!));
      assert.deepEqual(first.world!.tournament.standings, stableScores);
      host().room.send('configure', { mode: 'single', selection: 'manual', trackId: 'lagon' });
      await sleep(150);
      assert.deepEqual(first.world!.tournament.schedule, schedule, 'Le programme est verrouillé pendant le tournoi');
    }
  }

  host().room.send('nextRace'); await sleep(200);
  assert.equal(first.world!.phase, 'finished');
  host().room.send('rematch');
  await until(() => drivers.every(driver => driver.world?.phase === 'lobby' && driver.world.tournament.rounds.length === 0), 'nouveau tournoi');
  assert.equal(first.world!.tournament.raceIndex, 0);
  assert.equal(first.world!.trackId, schedule[0]);
  assert.deepEqual(first.world!.tournament.schedule, schedule);
  assert.ok(first.world!.tournament.standings.every(entry => entry.points === 0 && entry.racesCompleted === 0));
  record('Fin de tournoi et revanche : programme conservé, scores et course réinitialisés');

  host().room.send('configure', { mode: 'tournament', selection: 'random', trackPool: ['canyon', 'neon'], raceCount: 8 });
  await until(() => first.world?.tournament.selection === 'random', 'tirage aléatoire');
  const randomSchedule = first.world!.tournament.schedule;
  assert.equal(randomSchedule.length, 8);
  assert.ok(randomSchedule.every(id => ['canyon', 'neon'].includes(id)));
  for (let index = 1; index < randomSchedule.length; index++) assert.notEqual(randomSchedule[index], randomSchedule[index - 1]);
  record('Tirage aléatoire de huit manches : uniquement les circuits autorisés, sans répétition consécutive');
  const isolated = await sdk.create('race', { name: 'Circuit indépendant', practice: true });
  extras.push(isolated); isolated.onMessage('notice', () => {});
  let isolatedWorld: World | undefined;
  isolated.onMessage('snapshot', (snapshot: { world: World }) => { isolatedWorld = snapshot.world; });
  await until(() => Boolean(isolatedWorld), 'salon isolé');
  assert.equal(isolatedWorld!.trackId, 'lagon');
  assert.deepEqual(first.world!.tournament.schedule, randomSchedule);
  record('Les choix de circuits restent indépendants entre salons');
  const report = { origin, clients: count, kind: 'SDK clients using ordinary inputs', durationSeconds: (Date.now() - started) / 1000, checks, raceResults, randomSchedule };
  await mkdir('test-results', { recursive: true });
  await writeFile(process.env.REPORT_PATH || 'test-results/tournament.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, raceResults: undefined }, null, 2));
} finally {
  for (const driver of drivers) { clearInterval(driver.timer); if (driver.room.connection.isOpen) await driver.room.leave(); }
  for (const room of extras) if (room.connection.isOpen) await room.leave();
}
