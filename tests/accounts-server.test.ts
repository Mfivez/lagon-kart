import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, type Room } from 'colyseus.js';
import type { PlayerProfile } from '../shared/progression.js';
import type { World } from '../shared/game.js';

test('accounts HTTP, saved progression and multiplayer identities', { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lagon-accounts-api-'));
  const previousDirectory = process.env.PLAYER_DATA_DIR;
  process.env.PLAYER_DATA_DIR = join(directory, 'players');
  process.env.RECONNECT_SECONDS = '1';
  const { createGameServer } = await import('../server/app.js');
  const { playerStore, rankedQueue } = await import('../server/career.js');
  const { gameServer, httpServer } = createGameServer(directory);
  const rooms: Room[] = [];
  t.after(async () => {
    await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave()));
    await gameServer.gracefullyShutdown(false);
    await (await playerStore()).flush();
    if (previousDirectory === undefined) delete process.env.PLAYER_DATA_DIR;
    else process.env.PLAYER_DATA_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  });
  await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  async function request(path: string, body?: unknown, token = '', method = body === undefined ? 'GET' : 'POST', headers: Record<string, string> = {}) {
    const response = await fetch(origin + path, { method, headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, data: await response.json() as any };
  }
  const password = 'Classe kart ! 2026';
  let guest: { token: string; profile: PlayerProfile }, linked: typeof guest, second: typeof guest;

  await t.test('registration attaches the existing guest ID and earned progress without trusting forged fields', async () => {
    guest = (await request('/api/profile', { name: 'Pilote avant compte' })).data;
    const store = await playerStore();
    await store.recordRace({ id: 'account-api-fixture', trackId: 'lagon', ranked: false, finishedAt: Date.now(),
      entries: [{ playerId: guest.profile.id, rank: 1, finished: true, finishTime: 60 }] });
    await store.completeChampionship(guest.profile.id, 'discovery', 1, 2);
    const earned = (await request('/api/me', undefined, guest.token)).data.profile;
    const created = await request('/api/account/register', { username: 'Élève.01', password, xp: 99999, careerLevel: 3 }, guest.token);
    assert.equal(created.status, 201); linked = created.data;
    assert.equal(linked.profile.id, guest.profile.id); assert.equal(linked.profile.username, 'Élève.01');
    assert.equal(linked.profile.name, guest.profile.name); assert.equal(linked.profile.xp, earned.xp);
    assert.deepEqual(linked.profile.stats, earned.stats); assert.deepEqual(linked.profile.completedChampionships, ['discovery']);
    assert.equal(linked.profile.careerLevel, 1);
    assert.equal(created.headers.get('cache-control'), 'no-store');
    assert.ok(!JSON.stringify(linked.profile).includes('Hash'));
  });

  await t.test('fresh login restores the same pilot; duplicate, wrong-password and stale-session failures are explicit', async () => {
    assert.equal((await request('/api/account/register', { username: 'éLÈVE.01', password })).status, 409);
    const wrong = await request('/api/account/login', { username: 'élève.01', password: 'incorrect' });
    const missing = await request('/api/account/login', { username: 'inexistant', password: 'incorrect' });
    assert.equal(wrong.status, 401); assert.deepEqual(wrong.data, missing.data);
    const signedIn = await request('/api/account/login', { username: '  élève.01  ', password });
    assert.equal(signedIn.status, 200); second = signedIn.data;
    assert.equal(second.profile.id, linked.profile.id); assert.equal(second.profile.xp, linked.profile.xp);
    assert.notEqual(second.token, linked.token);
    assert.equal((await request('/api/me', undefined, linked.token)).status, 200);
    assert.equal((await request('/api/account/register', { username: 'AnotherPilot', password }, 'lk_' + 'x'.repeat(43))).status, 401);
    assert.equal((await request('/api/account/register', { username: 'AnotherPilot', password }, linked.token)).status, 409);
  });

  await t.test('logout revokes only its session and removes that pilot from the matchmaking queue', async () => {
    rankedQueue.join(linked.profile.id, linked.profile.mmr);
    assert.equal(rankedQueue.poll(linked.profile.id).state, 'queued');
    assert.equal((await request('/api/account/logout', {}, linked.token)).status, 200);
    assert.equal((await request('/api/me', undefined, linked.token)).status, 401);
    assert.equal((await request('/api/me', undefined, second.token)).status, 200);
    assert.equal(rankedQueue.poll(linked.profile.id).state, 'idle');
    assert.equal((await request('/api/account/logout', {}, linked.token)).status, 200, 'logout is idempotent');
    assert.equal((await request('/api/account/login', { username: 'élève.01', password })).status, 200);
  });

  await t.test('room admission uses recovered identity and rejects the revoked token', async () => {
    const sdk = new Client(origin.replace('http:', 'ws:'));
    await assert.rejects(sdk.create('race', { token: linked.token, name: 'Refused' }), /invalide/i);
    const room = await sdk.create('race', { token: second.token, name: second.profile.name }); rooms.push(room);
    const world = await new Promise<World>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing account room snapshot')), 5000);
      room.onMessage('snapshot', (message: { world: World }) => { clearTimeout(timer); resolve(message.world); });
      room.onMessage('notice', () => {});
    });
    const kart = world.players.find(player => player.id === room.sessionId)!;
    assert.equal(kart.playerId, second.profile.id); assert.equal(kart.careerLevel, 1);
    const publicState = JSON.stringify(world);
    for (const secret of [password, second.token, 'passwordHash', 'sessionTokenHashes']) assert.ok(!publicState.includes(secret));
    await room.leave();
  });

  await t.test('account endpoints reject foreign origins, bad methods and malformed bodies', async () => {
    assert.equal((await request('/api/account/login')).status, 405);
    assert.equal((await request('/api/account/unknown', {})).status, 404);
    assert.equal((await request('/api/account/register', { username: 'Student02', password }, '', 'POST', { origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await request('/api/account/register', { username: 'Student02', password }, '', 'POST', { 'content-type': 'text/plain' })).status, 415);
    const malformed = await fetch(origin + '/api/account/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await request('/api/account/register', { username: 'x', password })).status, 400);
    assert.equal((await request('/api/account/register', { username: 'ValidName', password: '123' })).status, 400);
    assert.equal((await request('/api/account/register', { username: { name: 'bad' }, password })).status, 400);
    const sameOrigin = await request('/api/account/login', { username: 'élève.01', password }, '', 'POST', { origin });
    assert.equal(sameOrigin.status, 200);
  });

  await t.test('repeated guesses are limited per login while the rest of the class can connect', async () => {
    for (let i = 0; i < 30; i++) assert.equal((await request('/api/account/login', { username: 'RateProbe', password: 'short' })).status, 401);
    const limited = await request('/api/account/login', { username: 'rateprobe', password: 'short' });
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await request('/api/account/login', { username: 'élève.01', password })).status, 200);
    const stored = await readFile(join(directory, 'players', 'players.json'), 'utf8');
    for (const secret of [password, guest.token, linked.token, second.token]) assert.ok(!stored.includes(secret), 'No raw password or bearer tokens on disk');
  });
});
