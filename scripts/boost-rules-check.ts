import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createWorld, createKart, startRace, stepWorld, neutralInput, COLORS, type Input } from '../shared/game.js';
import { autopilot } from '../shared/autopilot.js';

// Pure shared simulation. Real room admission, input transport and the browser
// are deliberately outside this check; the companion browser report covers them.
const modes = [
  { name: 'normal', practice: false, ranked: false },
  { name: 'practice-flag', practice: true, ranked: false },
  { name: 'ranked-flag', practice: false, ranked: true },
];
const worlds = modes.map(mode => {
  const world = createWorld(mode.practice, 'neon');
  world.ranked = mode.ranked;
  world.eventLevel = 3;
  world.players = [0, 1].map(index => createKart(`p${index}`, `Pilote ${index}`, COLORS[index]!, index, 'neon'));
  startRace(world);
  return world;
});
const normal = worlds[0]!;
const stats = { ticks: 0, boostedPlayerTicks: 0, maxSpeedMetresPerSecond: 0,
  pads: new Set<string>(), observedItems: new Set<string>() };

for (let tick = 0; tick < 30 * 130 && normal.phase !== 'finished'; tick++) {
  const commands = new Map<string, Input>(normal.players.map(kart => [kart.id,
    normal.phase === 'countdown'
      ? { ...neutralInput(tick), throttle: normal.countdown <= .8 ? 1 : 0 }
      : autopilot(kart, tick, true)]));
  for (const kart of normal.players) if (kart.item) stats.observedItems.add(kart.item);
  for (const world of worlds) stepWorld(world, commands, 1 / 30);
  assert.deepEqual(worlds[1]!.players, normal.players, `Practice flag divergence at tick ${tick}`);
  assert.deepEqual(worlds[2]!.players, normal.players, `Ranked flag divergence at tick ${tick}`);
  for (const kart of normal.players) {
    if (kart.boost > 0) stats.boostedPlayerTicks++;
    stats.maxSpeedMetresPerSecond = Math.max(stats.maxSpeedMetresPerSecond, kart.speed);
    for (const id of Object.keys(kart.padLaps)) stats.pads.add(id);
  }
  stats.ticks++;
}

assert.equal(normal.practice, false);
assert.equal(normal.phase, 'finished');
assert.equal(normal.players.filter(kart => kart.finished).length, 2);
assert.ok(normal.players.every(kart => kart.lap === 3));
assert.ok(stats.maxSpeedMetresPerSecond > 40);
assert.ok(stats.pads.size > 0);

const report = {
  executedAt: new Date().toISOString(),
  command: 'node --import tsx scripts/boost-rules-check.ts',
  result: 'passed',
  kind: 'shared-simulation',
  method: {
    circuit: 'neon', players: 2, laps: 3, stepSeconds: 1 / 30, eventLevel: 3,
    modes,
    controls: 'Same bounded ordinary inputs in all worlds: throttle during the final 0.8 seconds of countdown, then the existing autopilot with item use enabled.',
    parity: 'Deep equality of all public player fields after every simulation step.',
    stateChanges: 'Initial world creation and normal startRace only; no position, inventory, boost, progress or result injection during the race.',
  },
  measurements: {
    phase: normal.phase,
    raceSimulationSeconds: normal.raceTime,
    ticksIncludingCountdown: stats.ticks,
    boostedPlayerTicks: stats.boostedPlayerTicks,
    maxSpeedMetresPerSecond: stats.maxSpeedMetresPerSecond,
    distinctTriggeredPads: [...stats.pads],
    naturallyObservedItems: [...stats.observedItems],
    finishedPlayers: normal.players.filter(kart => kart.finished).length,
    playerLaps: normal.players.map(kart => ({ id: kart.id, laps: kart.lap })),
    practiceAndRankedFlagParity: true,
  },
  limits: [
    'Pure shared simulation, not a browser or Colyseus/network test.',
    'The practice-flag world deliberately retains two drivers for identical state comparison; a real practice room admits only one human.',
    'The ranked-flag world does not exercise matchmaking, ranked admission or MMR persistence.',
    'Observed item names mean naturally held inventory, not an independently measured activation count for each item.',
    'Boosted player ticks combine all active boost sources; this measurement does not distinguish their individual contributions.',
    'The autopilot does not deliberately drift; this reproduction does not independently validate a human mini-turbo gesture.',
  ],
};
const output = resolve(process.env.REPORT_FILE ?? 'docs/boost-normal-race/rules-validation.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
