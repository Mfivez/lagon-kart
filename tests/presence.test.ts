import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceRegistry } from '../server/presence.js';
import { MatchmakingQueue } from '../server/competitive.js';
import { PRESENCE_EXPIRY_MS } from '../shared/presence.js';

test('presence: multiple tabs and devices count one profile, closing one keeps the others online', () => {
  const registry = new PresenceRegistry(() => 1000);
  registry.heartbeat('tab-a', { id: 'alice', name: 'Alice' });
  registry.heartbeat('tab-b', { id: 'alice', name: 'Alice' });
  registry.heartbeat('tab-c', { id: 'bob', name: 'Bob' });
  assert.equal(registry.snapshot().connected, 2);
  registry.leave('tab-a', 'bob'); assert.equal(registry.snapshot().connected, 2);
  registry.leave('tab-a', 'alice'); assert.equal(registry.snapshot().connected, 2);
  registry.leave('tab-b', 'alice'); assert.deepEqual(registry.snapshot().players, [{ id: 'bob', name: 'Bob', status: 'home' }]);
});

test('presence: lost tabs expire without observers extending their leases', () => {
  let now = 1000; const registry = new PresenceRegistry(() => now);
  registry.heartbeat('tab-a', { id: 'alice', name: 'Alice' });
  now += PRESENCE_EXPIRY_MS - 1; assert.equal(registry.snapshot().connected, 1);
  now += 1; assert.equal(registry.snapshot().connected, 0);
});

test('presence: signing in rebinds only this tab and removes its previous guest immediately', () => {
  const registry = new PresenceRegistry(() => 1000);
  registry.heartbeat('tab-a', { id: 'guest', name: 'Invité' });
  registry.heartbeat('tab-a', { id: 'account', name: 'Pilote' });
  assert.deepEqual(registry.snapshot().players, [{ id: 'account', name: 'Pilote', status: 'home' }]);
  registry.leave('tab-a', 'guest'); assert.equal(registry.snapshot().connected, 1);
});

test('presence: server rooms and queue override home, include socket-only players and preserve deduplication', () => {
  let now = 1000; const registry = new PresenceRegistry(() => now);
  registry.heartbeat('tab-a', { id: 'alice', name: 'Alice' });
  const sources = [{ id: 'alice', name: 'Alice en piste', status: 'racing' as const },
    { id: 'bob', name: 'Bob', status: 'lobby' as const }, { id: 'alice', name: 'Alice', status: 'ranked-search' as const }];
  assert.deepEqual(registry.snapshot(sources), { connected: 2, searchingRanked: 1, players: [
    { id: 'alice', name: 'Alice', status: 'ranked-search' }, { id: 'bob', name: 'Bob', status: 'lobby' }] });
  now += PRESENCE_EXPIRY_MS;
  assert.equal(registry.snapshot(sources).connected, 2);
  assert.equal(registry.snapshot().connected, 0);
});

test('presence: capacity remains bounded and expired sessions free slots', () => {
  let now = 1000; const registry = new PresenceRegistry(() => now, 1);
  registry.heartbeat('tab-a', { id: 'alice', name: 'Alice' });
  registry.heartbeat('tab-a', { id: 'alice', name: 'Alice 2' });
  assert.throws(() => registry.heartbeat('tab-b', { id: 'bob', name: 'Bob' }), /pleine/);
  now += PRESENCE_EXPIRY_MS;
  registry.heartbeat('tab-b', { id: 'bob', name: 'Bob' }); assert.equal(registry.snapshot().connected, 1);
});

test('presence: observing ranked searches never refreshes the authoritative queue heartbeat', () => {
  const queue = new MatchmakingQueue(); queue.join('alice', 800, 1000);
  assert.deepEqual(queue.presence(20_000), [{ playerId: 'alice', state: 'queued' }]);
  assert.deepEqual(queue.presence(46_001), []);
});

test('presence: ranked activity distinguishes searching, matching and assigned matches', () => {
  const queue = new MatchmakingQueue(); queue.join('alice', 800, 1000); queue.join('bob', 810, 1000);
  const match = queue.popMatches(4000)[0]!;
  assert.ok(queue.presence(4000).every(player => player.state === 'matching'));
  queue.assignMatch(match.id, 'ROOM01');
  assert.ok(queue.presence(4000).every(player => player.state === 'matched'));
  queue.consume('alice', 'ROOM01');
  assert.deepEqual(queue.presence(4000), [{ playerId: 'bob', state: 'matched' }]);
  queue.cancel('bob', 4000); assert.deepEqual(queue.presence(4000), []);
});
