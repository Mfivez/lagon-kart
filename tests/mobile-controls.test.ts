import assert from 'node:assert/strict';
import test from 'node:test';
import { TouchDriveState } from '../client/mobile-controls.js';

const active = () => { const controls = new TouchDriveState(); controls.active = true; return controls; };
test('touch: auto starts at GO, manual pedal still supports a timed launch', () => {
  const controls = active();
  assert.equal(controls.sample(false).forward, false);
  controls.press(1, 'accelerate'); assert.equal(controls.sample(false).forward, true);
  controls.release(1); assert.equal(controls.sample(true).forward, true);
  controls.autoAccelerate = false; assert.equal(controls.sample(true).forward, false);
});
test('touch: independent fingers preserve steering while drifting and braking', () => {
  const controls = active(); controls.press(1, 'steer'); controls.move(1, .55); controls.press(2, 'drift');
  const driving = controls.sample(true); assert.ok(Math.abs(driving.steer - .5) < .0001); assert.ok(driving.drift && driving.forward);
  controls.press(3, 'brake'); const braking = controls.sample(true); assert.ok(braking.backward && !braking.forward && braking.drift);
  controls.release(2); assert.equal(controls.sample(true).steer, driving.steer); assert.equal(controls.sample(true).drift, false);
  controls.release(1); assert.equal(controls.sample(true).steer, 0); assert.equal(controls.sample(true).backward, true);
});
test('touch: two fingers on a button do not release it prematurely or duplicate item edges', () => {
  const controls = active(); controls.press(1, 'drift'); controls.press(2, 'drift'); controls.release(1);
  assert.equal(controls.sample(true).drift, true); controls.release(2); assert.equal(controls.sample(true).drift, false);
  controls.press(3, 'item'); controls.press(4, 'item'); assert.equal(controls.sample(true).use, true);
  assert.equal(controls.sample(true).use, false); controls.release(3); assert.equal(controls.sample(true).use, false);
  controls.release(4); controls.press(5, 'item'); assert.equal(controls.sample(true).use, true);
});
test('touch: steering remains bounded and a second pointer cannot hijack the thumb', () => {
  const controls = active(); controls.press(1, 'steer'); controls.move(1, 20); assert.equal(controls.sample(true).steer, 1);
  assert.equal(controls.press(2, 'steer'), false); controls.move(2, -1); assert.equal(controls.sample(true).steer, 1);
  controls.move(1, .04); assert.equal(controls.sample(true).steer, 0);
  controls.move(1, -10); assert.equal(controls.sample(true).steer, -1);
});
test('touch: cancel, focus loss or rotation clears edges and suspends auto until intentional input', () => {
  const controls = active(); controls.press(1, 'steer'); controls.move(1, 1); controls.press(2, 'drift'); controls.press(3, 'item'); controls.press(4, 'reset');
  controls.clear(true);
  assert.deepEqual(controls.sample(true), { steer: 0, forward: false, backward: false, drift: false, use: false, reset: false });
  controls.release(1); assert.equal(controls.sample(true).forward, false);
  controls.press(9, 'brake'); assert.equal(controls.sample(true).backward, true);
  controls.release(9); assert.equal(controls.sample(true).forward, true);
});
test('touch: spectators, finished races and countdown taps cannot send racing actions', () => {
  const controls = new TouchDriveState(); assert.equal(controls.press(1, 'item'), false); assert.equal(controls.sample(true).forward, false);
  controls.active = true; controls.press(1, 'item'); controls.press(2, 'reset');
  assert.equal(controls.sample(false).use, false); assert.equal(controls.sample(true).use, false); assert.equal(controls.sample(true).reset, false);
  controls.clear(); controls.active = false; assert.equal(controls.sample(true).forward, false);
});
