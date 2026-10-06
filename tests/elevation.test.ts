import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKS, trackElevation, trackPoint } from '../shared/track.js';
import { createKart, neutralInput, stepKart } from '../shared/game.js';
import { autopilot } from '../shared/autopilot.js';

for (const track of TRACKS.filter(track => track.elevations.length)) {
  test(`${track.id}: bridge follows the road; launch, flight and landing are deterministic`, () => {
    const bridge = track.elevations.find(feature => feature.kind === 'bridge')!;
    const bridgeProgress = (bridge.start + bridge.end) / 2;
    const kart = createKart('jump', 'Jump test', '#fc735d', 0, track.id);
    Object.assign(kart, trackPoint(bridgeProgress, track.id));
    stepKart(kart, neutralInput(), 1 / 30);
    assert.ok(Math.abs(kart.elevation - bridge.height) < .01);
    assert.equal(kart.airborne, false);
    const jump = track.elevations.find(feature => feature.kind === 'jump')!;
    Object.assign(kart, trackPoint(jump.end - .4, track.id), {
      elevation: trackElevation(jump.end - .4, track.id), speed: 32,
      verticalVelocity: 0, airborne: false,
    });
    const predicted = structuredClone(kart);
    let launched = false, landed = false, peak = 0, airFrames = 0;
    for (let tick = 0; tick < 120; tick++) {
      // This isolates motion: checkpoint progression belongs to stepWorld.
      const input = { ...autopilot(kart, tick, false), reset: false };
      stepKart(kart, input, 1 / 30); stepKart(predicted, input, 1 / 30);
      assert.deepEqual(predicted, kart, 'client prediction must match server motion');
      assert.ok(Number.isFinite(kart.elevation));
      if (kart.airborne) { launched = true; airFrames++; peak = Math.max(peak, kart.elevation); }
      if (launched && !kart.airborne) { landed = true; break; }
    }
    assert.ok(launched, 'ramp must actually launch');
    assert.ok(peak > jump.height + .5, 'visible flight above the ramp');
    assert.ok(airFrames >= 10 && airFrames < 60, `bounded flight: ${airFrames} frames`);
    assert.ok(landed, 'the kart must land and continue driving');
    assert.equal(kart.verticalVelocity, 0);
    assert.ok(kart.speed > 15, 'landing remains forgiving');
  });
}

test('flat tracks never introduce altitude or flight', () => {
  const kart = createKart('flat', 'Flat', '#fc735d', 0, 'lagon');
  for (let tick = 0; tick < 200; tick++) stepKart(kart, autopilot(kart, tick, false), 1 / 30);
  assert.equal(kart.elevation, 0); assert.equal(kart.airborne, false); assert.equal(kart.verticalVelocity, 0);
});
