import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, TRACKS, createKart, createWorld, neutralInput, startRace, stepWorld, trackPoint, validateInput } from '../shared/game.js';
import { getCpuInput } from '../shared/cpu.js';
import { CPU_ROLES, assignTeam, cpuRole, teamScoreRound, teamStandings, type TeamMember } from '../shared/teams.js';
import { getTrackEvent } from '../shared/track-events.js';

test('automatic teams balance human and CPU seats four against four without changing existing assignments', () => {
  const players: TeamMember[] = [];
  for (let i = 0; i < 8; i++) players.push({ id: `p${i}`, team: assignTeam(players, i) });
  assert.equal(players.filter(player => player.team === 0).length, 4);
  assert.equal(players.filter(player => player.team === 1).length, 4);
  assert.throws(() => assignTeam(players), /complètes/);
  const saved = structuredClone(players); players[2]!.abandoned = true;
  assert.equal(assignTeam(players), 0);
  assert.deepEqual(players.map(player => player.team), saved.map(player => player.team));
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => cpuRole(i)), [...CPU_ROLES, ...CPU_ROLES].map(role => role.id));
});

test('team points accumulate all four drivers over rounds, retain departures, ignore spectators and resolve ties consistently', () => {
  const drivers = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, team: (i < 4 ? 0 : 1) as 0 | 1,
    rank: i + 1, finished: true, finishTime: 60 + i }));
  const first = teamScoreRound(drivers);
  assert.equal(first[0]!.team, 0); assert.equal(first[0]!.points, 45); assert.equal(first[1]!.points, 13);
  drivers[0]!.finished = false;
  const withoutWinner = teamScoreRound([...drivers, { id: 'watcher', team: 1, rank: 1, finished: true, finishTime: 1, spectator: true }]);
  assert.equal(withoutWinner[0]!.points, 30); assert.equal(withoutWinner[1]!.points, 13);
  const cup = teamStandings([{ id: 'left', points: 50, wins: 1, racesCompleted: 4, totalTime: 200 },
    { id: 'right', points: 50, wins: 1, racesCompleted: 4, totalTime: 210 }, { id: 'unassigned', points: 999 }], { left: 0, right: 1 });
  assert.equal(cup[0]!.team, 0); assert.equal(cup[1]!.rank, 2);
  assert.deepEqual(teamStandings([], {}).map(team => team.rank), [1, 1]);
});

test('CPU decisions are deterministic ordinary inputs and cannot mutate physics, inventory or progress', () => {
  const kart = createKart('cpu', 'CPU', COLORS[0]!, 0);
  const before = structuredClone(kart);
  const first = getCpuInput(kart, 7), second = getCpuInput(kart, 7);
  assert.deepEqual(first, second); assert.deepEqual(kart, before); assert.deepEqual(validateInput(first), first);
  assert.equal(first.seq, 7); assert.equal(first.epoch, kart.epoch);
  for (const difficulty of ['easy', 'normal', 'hard', 0, 1, NaN] as const) assert.ok(validateInput(getCpuInput(kart, 8, {}, difficulty)));
});

test('CPU object timing targets enemies, preserves triple charges during active boost, and responds to a nearby threat', () => {
  const kart = createKart('cpu', 'CPU', COLORS[0]!, 0), other = createKart('other', 'Autre', COLORS[1]!, 1);
  const point = trackPoint(40); Object.assign(kart, point, { speed: 25, team: 0, progress: 40 });
  Object.assign(other, point, { x: point.x + Math.sin(point.angle) * 10, z: point.z + Math.cos(point.angle) * 10, team: 0, progress: 50 });
  kart.item = 'seeker';
  assert.equal(getCpuInput(kart, 3, { teamMode: true, players: [kart, other] }).use, false);
  other.team = 1;
  assert.equal(getCpuInput(kart, 3, { teamMode: true, players: [kart, other] }).use, true);
  kart.item = 'tripleTurbo'; kart.boost = 1;
  assert.equal(getCpuInput(kart, 3, { players: [kart, other] }).use, false);
  kart.item = 'shield';
  assert.equal(getCpuInput(kart, 3, { players: [kart, other] }).use, true);
  kart.itemLatch = true;
  assert.equal(getCpuInput(kart, 3, { players: [kart, other] }).use, false);
});

for (const track of TRACKS) test(`${track.id}: eight CPUs finish with ordinary inputs through all dynamic stages`, () => {
  const world = createWorld(false, track.id); world.eventLevel = 3; world.teamMode = true;
  world.players = Array.from({ length: 8 }, (_, i) => createKart(`cpu-${i}`, `CPU ${i}`, COLORS[i]!, i, track.id));
  world.players.forEach((kart, i) => { kart.cpu = true; kart.team = i % 2 as 0 | 1; });
  startRace(world);
  for (let tick = 0; tick < 90; tick++) stepWorld(world, new Map(), 1 / 30);
  let sawBranch = false;
  for (let tick = 0; tick < 30 * 280 && world.phase === 'racing'; tick++) {
    stepWorld(world, new Map(world.players.map(kart => [kart.id, getCpuInput(kart, tick, world)])), 1 / 30);
    sawBranch ||= world.eventStage > 0 && getTrackEvent(track.id, world.eventStage, world.eventLevel).blockers.length > 0;
  }
  assert.equal(world.phase, 'finished', `${track.id}: phase ${world.phase}, laps ${world.players.map(kart => kart.lap)}`);
  assert.equal(world.players.filter(kart => kart.finished).length, 8, `${track.id}: finished ${world.players.filter(kart => kart.finished).length}, laps ${world.players.map(kart => kart.lap)}`);
  assert.ok(sawBranch); assert.equal(world.eventStage, 2);
});
