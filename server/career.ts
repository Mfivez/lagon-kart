import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { AccountError, PlayerStore } from './player-store.js';
import { MatchmakingQueue } from './competitive.js';
import { TRACK_IDS } from '../shared/track.js';
import type { RaceRoom } from './RaceRoom.js';

// This nonce is never sent to a browser. Only the queue may create rated rooms.
export const INTERNAL_ROOM_KEY = randomBytes(32).toString('hex');
export const rankedQueue = new MatchmakingQueue();
export const activeRankedPlayers = new Set<string>();
const stores = new Map<string, Promise<PlayerStore>>();
export function playerStore(): Promise<PlayerStore> {
  const directory = resolve(process.env.PLAYER_DATA_DIR ?? 'data/players');
  let store = stores.get(directory);
  if (!store) { store = PlayerStore.open(directory); stores.set(directory, store); }
  return store;
}
let pumping: Promise<void> | undefined;
async function matchWaitingPlayers() {
  if (pumping) return pumping;
  pumping = (async () => {
    for (const group of rankedQueue.popMatches()) {
      try {
        const room = await matchMaker.createRoom('race', { internalKey: INTERNAL_ROOM_KEY,
          rankedMatchId: group.id,
          rankedPlayers: group.players.map(player => player.playerId), trackId: TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)] });
        rankedQueue.assignMatch(group.id, room.roomId);
      } catch { rankedQueue.releaseMatch(group.id); }
    }
  })();
  try { await pumping; } finally { pumping = undefined; }
}
const rates = new Map<string, { at: number; count: number }>();
const accountRates = new Map<string, { at: number; count: number }>();
async function cancelQueuedPlayer(playerId: string) {
  const reservation = rankedQueue.poll(playerId);
  rankedQueue.cancel(playerId);
  if (reservation.state === 'matched') {
    const room = matchMaker.getLocalRoomById(reservation.roomId) as RaceRoom | undefined;
    await room?.cancelRankedLobby();
  }
}
export async function handleCareerRequest(req: IncomingMessage, res: ServerResponse,
  readBody: () => Promise<Record<string, unknown>>): Promise<void> {
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  const url = new URL(req.url ?? '/', 'http://internal.invalid');
  const method = req.method ?? 'GET';
  const ip = req.socket.remoteAddress ?? '';
  let rate = rates.get(ip);
  if (!rate || Date.now() - rate.at > 60_000) { rate = { at: Date.now(), count: 0 }; if (rates.size > 2048) rates.clear(); rates.set(ip, rate); }
  if (++rate.count > 600) { req.resume(); send(429, { error: 'Trop de requêtes. Réessayez dans un instant.' }); return; }
  try {
    const store = await playerStore();
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    if (url.pathname.startsWith('/api/account/')) {
      if (!['/api/account/register', '/api/account/login', '/api/account/logout'].includes(url.pathname)) {
        send(404, { error: 'Route inconnue.' }); return;
      }
      if (method !== 'POST') { req.resume(); send(405, { error: 'Méthode non autorisée.' }); return; }
      // No cookies or cross-origin authentication: the game and its tunnel use
      // the same host. SDK/CLI clients may omit Origin as before.
      if (req.headers.origin) {
        let sameHost = false;
        try { sameHost = new URL(req.headers.origin).host === req.headers.host; } catch { /* Invalid origin is rejected. */ }
        if (!sameHost) { req.resume(); send(403, { error: 'Connectez-vous depuis la page du jeu.' }); return; }
      }
      if (url.pathname === '/api/account/logout') {
        const profile = store.authenticate(token);
        if (profile) await cancelQueuedPlayer(profile.id);
        await store.logout(token); req.resume(); send(200, { ok: true }); return;
      }
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        req.resume(); send(415, { error: 'Envoyez les informations du compte au format JSON.' }); return;
      }
      const body = await readBody().catch(() => { throw new AccountError('Informations du compte invalides.', 400); });
      // Cloudflare shares its socket address among the entire class. Limit a
      // particular login name instead of locking out every student together.
      const key = ip + ':' + (typeof body.username === 'string' ? body.username.normalize('NFKC').trim().toLowerCase().slice(0, 128) : '');
      let attempts = accountRates.get(key);
      if (!attempts || Date.now() - attempts.at >= 60_000) {
        attempts = { at: Date.now(), count: 0 };
        if (accountRates.size >= 4096) accountRates.clear();
        accountRates.set(key, attempts);
      }
      if (++attempts.count > 30) {
        res.setHeader('Retry-After', '60'); send(429, { error: 'Trop de tentatives pour cet identifiant. Réessayez dans une minute.' }); return;
      }
      if (url.pathname === '/api/account/register') {
        send(201, await store.registerAccount(body.username, body.password, token || undefined));
      } else {
        send(200, await store.loginAccount(body.username, body.password));
      }
      return;
    }
    if (url.pathname === '/api/profile' && method === 'POST') {
      const body = await readBody(); send(201, await store.createPlayer(String(body.name ?? 'Pilote'))); return;
    }
    if (url.pathname === '/api/leaderboard' && method === 'GET') {
      send(200, { entries: store.leaderboard(50, url.searchParams.get('season') ?? undefined) }); return;
    }
    if (url.pathname === '/api/ghost' && method === 'GET') {
      send(200, { ghost: await store.bestGhost(url.searchParams.get('track') ?? 'lagon', url.searchParams.get('ranked') === 'true', url.searchParams.has('level') ? Number(url.searchParams.get('level')) : undefined) }); return;
    }
    if (url.pathname.startsWith('/api/replays/') && method === 'GET') {
      const replay = await store.getReplay(url.pathname.slice('/api/replays/'.length));
      send(replay ? 200 : 404, replay ? { replay } : { error: 'Replay introuvable.' }); return;
    }
    const profile = store.authenticate(token);
    if (!profile) { send(401, { error: 'Profil absent ou expiré. Rechargez la page.' }); return; }
    if (url.pathname === '/api/me' && method === 'GET') { send(200, { profile }); return; }
    if (url.pathname === '/api/me' && method === 'PATCH') { const body = await readBody(); send(200, { profile: await store.updateName(profile.id, String(body.name ?? profile.name)) }); return; }
    if (url.pathname === '/api/replays' && method === 'GET') { send(200, { replays: store.listReplays(profile.id) }); return; }
    if (url.pathname === '/api/ranked') {
      if (method === 'DELETE') {
        await cancelQueuedPlayer(profile.id);
        send(200, { state: 'idle' }); return;
      }
      if (method !== 'GET' && method !== 'POST') { send(405, { error: 'Méthode non autorisée.' }); return; }
      if (activeRankedPlayers.has(profile.id)) { send(409, { error: 'Terminez votre course classée avant de revenir dans la file.' }); return; }
      if (method === 'POST') rankedQueue.join(profile.id, profile.mmr);
      else rankedQueue.poll(profile.id);
      await matchWaitingPlayers(); send(200, rankedQueue.poll(profile.id)); return;
    }
    send(404, { error: 'Route inconnue.' });
  } catch (error) {
    if (error instanceof AccountError) { send(error.status, { error: error.message }); return; }
    if (url.pathname.startsWith('/api/account/')) { send(500, { error: 'Le compte ne peut pas être sauvegardé pour le moment. Réessayez.' }); return; }
    send(400, { error: error instanceof Error ? error.message : 'Requête invalide.' });
  }
}
