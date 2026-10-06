import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { PlayerStore } from './player-store.js';
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
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const profile = store.authenticate(token);
    if (!profile) { send(401, { error: 'Profil absent ou expiré. Rechargez la page.' }); return; }
    if (url.pathname === '/api/me' && method === 'GET') { send(200, { profile }); return; }
    if (url.pathname === '/api/me' && method === 'PATCH') { const body = await readBody(); send(200, { profile: await store.updateName(profile.id, String(body.name ?? profile.name)) }); return; }
    if (url.pathname === '/api/replays' && method === 'GET') { send(200, { replays: store.listReplays(profile.id) }); return; }
    if (url.pathname === '/api/ranked') {
      if (method === 'DELETE') {
        const reservation = rankedQueue.poll(profile.id);
        rankedQueue.cancel(profile.id);
        if (reservation.state === 'matched') {
          const room = matchMaker.getLocalRoomById(reservation.roomId) as RaceRoom | undefined;
          await room?.cancelRankedLobby();
        }
        send(200, { state: 'idle' }); return;
      }
      if (method !== 'GET' && method !== 'POST') { send(405, { error: 'Méthode non autorisée.' }); return; }
      if (activeRankedPlayers.has(profile.id)) { send(409, { error: 'Terminez votre course classée avant de revenir dans la file.' }); return; }
      if (method === 'POST') rankedQueue.join(profile.id, profile.mmr);
      else rankedQueue.poll(profile.id);
      await matchWaitingPlayers(); send(200, rankedQueue.poll(profile.id)); return;
    }
    send(404, { error: 'Route inconnue.' });
  } catch (error) { send(400, { error: error instanceof Error ? error.message : 'Requête invalide.' }); }
}
