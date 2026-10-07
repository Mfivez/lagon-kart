import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlayerProfile } from '../shared/progression.js';

class Dialog extends EventTarget { id = ''; className = ''; innerHTML = ''; open = false; close() { this.open = false; this.dispatchEvent(new Event('close')); } showModal() { this.open = true; } }
const profile = (id = 'a', mmr = 800): PlayerProfile => ({ id, name: id, createdAt: 1, xp: 0, careerLevel: 0, completedChampionships: [], stats: { races: 0, finishes: 0, wins: 0, podiums: 0, totalRaceTime: 0, bestTimes: {} }, season: '2026-Q4', mmr, rank: mmr > 900 ? 'Silver' : 'Bronze', ranked: { season: '2026-Q4', mmr, races: 0, wins: 0, peakMmr: mmr } });
test('career queue has one owner, survives menu close, cancels a late POST and synchronizes identity', async t => {
  const values = new Map([['lagon-player-token', 'token-a']]); let dialog: Dialog;
  const original = { document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }, document: { createElement: () => (dialog = new Dialog()), body: { append: () => {} } } });
  t.after(() => Object.assign(globalThis, original));
  const { CareerUI } = await import('../client/career-ui.js');
  const requests: string[] = []; let current = profile(), postGate: Promise<void> | undefined, canQueue = true, failPoll = false;
  let serverQueued = false, losePostResponse = false, failedDeletes = 0;
  let releasePost!: () => void; let joined = 0;
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET'; requests.push(`${method} ${url}`);
    assert.ok(options?.signal, 'network calls have a bounded timeout signal');
    if (failPoll && url === '/api/ranked' && method === 'GET') return new Response(JSON.stringify({ error: 'Connexion momentanément indisponible.' }), { status: 503 });
    if (url === '/api/ranked' && method === 'POST') { await postGate; serverQueued = true; if (losePostResponse) throw Error('Réponse POST perdue après inscription serveur.'); }
    if (url === '/api/ranked' && method === 'DELETE') { if (failedDeletes-- > 0) throw Error('DELETE momentanément indisponible.'); serverQueued = false; }
    let body: unknown = url === '/api/ranked' ? { state: method === 'DELETE' ? 'idle' : 'queued', waitSeconds: 0 } : { profile: current };
    if (url === '/api/leaderboard') body = { entries: [] }; if (url === '/api/replays') body = { replays: [] };
    if (url === '/api/account/login') { current = profile('b', 1000); body = { token: 'token-b', profile: current }; }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const career = new CareerUI({ canQueue: () => canQueue, profile: () => {}, championship: async () => {}, ranked: async () => { joined++; }, replay: () => {}, error: () => {} });
  const seen: Array<string | undefined> = []; career.subscribe(state => seen.push(state.profile?.id)); await career.restore();
  await t.test('closing the career menu does not cancel or create a second queue', async () => {
    await career.open('a'); await career.joinQueue(); await career.joinQueue(); dialog!.close();
    assert.equal(career.isSearching, true); assert.equal(requests.filter(value => value === 'POST /api/ranked').length, 1);
    assert.equal(requests.includes('DELETE /api/ranked'), false); await career.cancelQueue(); assert.equal(career.isSearching, false);
  });
  await t.test('cancel waits for an in-flight POST so it cannot revive the queue afterwards', async () => {
    postGate = new Promise(resolve => { releasePost = resolve; }); const starting = career.joinQueue();
    while (requests.filter(value => value === 'POST /api/ranked').length < 2) await new Promise(resolve => setTimeout(resolve, 1));
    const cancelling = career.cancelQueue(); releasePost(); await Promise.all([starting, cancelling]); postGate = undefined;
    assert.equal(requests.at(-1), 'DELETE /api/ranked'); assert.equal(career.isSearching, false); assert.equal(joined, 0);
  });
  await t.test('a poll failure displays a recoverable error and cleans up the queue', async () => {
    failPoll = true; await career.joinQueue(); failPoll = false;
    assert.equal(career.rankedState.state, 'error'); assert.match(career.rankedState.status, /indisponible/); assert.equal(career.isSearching, false);
    assert.equal(requests.at(-1), 'DELETE /api/ranked');
  });
  await t.test('a lost POST reply and failed first DELETE still cancel the real entry before another room', async () => {
    losePostResponse = true; failedDeletes = 1; await career.joinQueue(); losePostResponse = false;
    assert.equal(career.rankedState.state, 'error'); assert.equal(career.isSearching, false); assert.equal(serverQueued, true);
    await career.cancelQueue(); assert.equal(serverQueued, false); assert.equal(requests.at(-1), 'DELETE /api/ranked'); assert.equal(joined, 0);
  });
  await t.test('room guard prevents queueing; identity switch cancels and publishes the new server grade/MMR', async () => {
    canQueue = false; const count = requests.length; await career.joinQueue(); assert.equal(requests.length, count); canQueue = true;
    await career.joinQueue(); await career.account('login', 'b', 'password');
    assert.ok(requests.lastIndexOf('DELETE /api/ranked') < requests.lastIndexOf('POST /api/account/login'));
    assert.equal(career.rankedState.profile?.mmr, 1000); assert.equal(career.rankedState.profile?.rank, 'Silver'); assert.equal(seen.at(-1), 'b');
    await career.logout(); assert.equal(career.rankedState.profile, undefined); assert.equal(seen.at(-1), undefined);
  });
});
