import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConfiguration, createTournament, drawSchedule, rankTournament,
  recordRound, registerTournamentDriver, restartTournament, TOURNAMENT_POINTS,
  type TournamentDriver, type TournamentEntry } from '../shared/tournament.js';

const driver = (id: string, rank: number, finished = true, finishTime = 60 + rank): TournamentDriver =>
  ({ id, name: `Pilote ${id}`, color: '#fc735d', rank, finished, finishTime });
const manual = (schedule = ['lagon', 'canyon']) => applyConfiguration(createTournament(), {
  mode: 'tournament', selection: 'manual', raceCount: schedule.length, schedule,
}, 'lagon').tournament;

test('configuration is validated atomically, preserves manual order and permits repeated circuits', () => {
  const initial = createTournament();
  const before = JSON.stringify(initial);
  for (const payload of [
    null, [], { mode: 'admin', selection: 'manual' },
    { mode: 'single', selection: 'manual', trackId: 'missing' },
    { mode: 'single', selection: 'manual', trackId: 'lagon', points: 999 },
    { mode: 'tournament', selection: 'manual', raceCount: 1, schedule: ['lagon'] },
    { mode: 'tournament', selection: 'manual', raceCount: 9, schedule: ['lagon'] },
    { mode: 'tournament', selection: 'manual', raceCount: 2.5, schedule: ['lagon'] },
    { mode: 'tournament', selection: 'manual', raceCount: 2, schedule: ['lagon', 'missing'] },
    { mode: 'tournament', selection: 'manual', raceCount: 3, schedule: ['lagon', 'canyon'] },
    { mode: 'tournament', selection: 'random', raceCount: 2, trackPool: ['lagon', 'lagon'] },
    { mode: 'tournament', selection: 'random', raceCount: 2, trackPool: [] },
    { mode: 'tournament', selection: 'random', raceCount: 2, schedule: ['lagon', 'canyon'] },
  ]) {
    assert.throws(() => applyConfiguration(initial, payload, 'lagon'));
    assert.equal(JSON.stringify(initial), before);
  }
  const schedule = ['neon', 'canyon', 'neon', 'glacier'];
  const configured = applyConfiguration(initial, { mode: 'tournament', selection: 'manual', raceCount: 4, schedule }, 'lagon');
  assert.equal(configured.trackId, 'neon');
  assert.deepEqual(configured.tournament.schedule, schedule);
  schedule[0] = 'lagon';
  assert.equal(configured.tournament.schedule[0], 'neon');
  assert.equal(JSON.stringify(initial), before);
  assert.equal(applyConfiguration(initial, { mode: 'single', selection: 'manual', trackId: 'glacier' }, 'lagon').trackId, 'glacier');
});

test('random series exhausts each pool before repeating and never changes a drawn schedule', () => {
  const pool = ['lagon', 'canyon', 'glacier', 'neon'];
  const configured = applyConfiguration(createTournament(), { mode: 'tournament', selection: 'random', raceCount: 8, trackPool: pool }, 'lagon', () => 0);
  const tournament = configured.tournament;
  assert.equal(new Set(tournament.schedule.slice(0, 4)).size, 4);
  assert.equal(new Set(tournament.schedule.slice(4)).size, 4);
  assert.notEqual(tournament.schedule[3], tournament.schedule[4]);
  assert.ok(tournament.schedule.every(track => pool.includes(track)));
  const schedule = [...tournament.schedule];
  const repeated = applyConfiguration(tournament, { mode: 'tournament', selection: 'random', raceCount: 8, trackPool: pool }, schedule[0]!, () => 0.999);
  assert.deepEqual(repeated.tournament.schedule, schedule, 'repeating the same settings must not silently reroll');
  recordRound(tournament, schedule[0]!, [driver('a', 1)]);
  assert.deepEqual(tournament.schedule, schedule);
  const restarted = restartTournament(tournament, schedule[0]!, () => 0.999);
  assert.notDeepEqual(restarted.schedule, schedule);
  assert.deepEqual(tournament.schedule, schedule);
  assert.deepEqual(drawSchedule(['neon'], 2, () => 0.5), ['neon', 'neon']);
});

test('every finish position earns its points once; DNF and spectators earn zero', () => {
  const tournament = manual();
  const drivers = Array.from({ length: 8 }, (_, i) => driver(`p${i}`, i + 1));
  assert.equal(recordRound(tournament, 'lagon', drivers), true);
  assert.deepEqual(tournament.standings.map(entry => entry.points), [...TOURNAMENT_POINTS]);
  const scored = JSON.stringify(tournament);
  assert.equal(recordRound(tournament, 'lagon', drivers), false);
  assert.equal(JSON.stringify(tournament), scored);
  tournament.raceIndex = 1;
  const late = { ...driver('late', 9), spectator: true };
  registerTournamentDriver(tournament, late);
  assert.equal(recordRound(tournament, 'lagon', drivers), false, 'the wrong circuit cannot score the next round');
  drivers[0]!.finished = false;
  assert.equal(recordRound(tournament, 'canyon', [...drivers, late]), true);
  assert.equal(tournament.standings.find(entry => entry.id === 'p0')!.points, 15);
  assert.equal(tournament.standings.find(entry => entry.id === 'p1')!.points, 24);
  assert.equal(tournament.standings.find(entry => entry.id === 'late')!.points, 0);
  assert.equal(tournament.rounds[1]!.results.some(entry => entry.id === 'late'), false);
  assert.equal(tournament.rounds[1]!.results[0]!.finishTime, 0);
  assert.equal(tournament.completed, true);
  assert.equal(recordRound(tournament, 'canyon', drivers), false);
  const finalRanks = JSON.stringify(tournament.standings);
  registerTournamentDriver(tournament, driver('arrived-after-finals', 1));
  assert.equal(JSON.stringify(tournament.standings), finalRanks, 'completed standings stay frozen until rematch');
});

test('league ties use wins, completed races, cumulative finish time and finally stable identity', () => {
  const tournament = manual();
  const entry = (id: string, wins: number, racesCompleted: number, totalTime: number): TournamentEntry =>
    ({ id, name: id, color: '#ffffff', points: 20, wins, racesCompleted, totalTime, rank: 0 });
  tournament.standings = [entry('z', 0, 2, 100), entry('b', 0, 2, 90), entry('a', 0, 2, 90),
    entry('one-finish', 0, 1, 1), entry('winner', 1, 1, 500)];
  rankTournament(tournament);
  assert.deepEqual(tournament.standings.map(row => row.id), ['winner', 'a', 'b', 'z', 'one-finish']);
  assert.deepEqual(tournament.standings.map(row => row.rank), [1, 2, 3, 4, 5]);
});

test('leaving cannot erase scored points, late entrants start at zero and rematch clears all totals', () => {
  const tournament = manual(['canyon', 'neon']);
  recordRound(tournament, 'canyon', [driver('left', 1), driver('stays', 2)]);
  registerTournamentDriver(tournament, driver('late', 3));
  tournament.raceIndex = 1;
  recordRound(tournament, 'neon', [driver('stays', 1), driver('late', 2)]);
  assert.equal(tournament.standings.find(row => row.id === 'left')!.points, 15);
  assert.equal(tournament.standings.find(row => row.id === 'stays')!.points, 27);
  assert.equal(tournament.standings.find(row => row.id === 'late')!.points, 12);
  const next = restartTournament(tournament, 'neon');
  assert.deepEqual(next.schedule, ['canyon', 'neon']);
  assert.deepEqual(next.standings, []);
  assert.deepEqual(next.rounds, []);
  assert.equal(next.raceIndex, 0);
  assert.equal(next.completed, false);
  assert.equal(tournament.rounds.length, 2);
});
