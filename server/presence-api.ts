import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { playerStore, rankedQueue } from './career.js';
import { PresenceRegistry } from './presence.js';
import type { RaceRoom } from './RaceRoom.js';
import type { OnlinePlayer, PresenceStatus } from '../shared/presence.js';

async function authoritativePlayers(): Promise<OnlinePlayer[]> {
  const store = await playerStore();
  const players: OnlinePlayer[] = [];
  for (const entry of rankedQueue.presence()) {
    const profile = store.getProfile(entry.playerId);
    if (profile) players.push({ id: profile.id, name: profile.name,
      status: entry.state === 'matched' ? 'ranked-ready' : 'ranked-search' });
  }
  for (const listing of await matchMaker.query({ name: 'race' })) {
    const room = matchMaker.getLocalRoomById(listing.roomId) as RaceRoom | undefined;
    const world = room?.world;
    if (!world) continue;
    for (const kart of world.players) {
      if (!kart.connected || kart.cpu || kart.abandoned) continue;
      const status: PresenceStatus = world.phase === 'finished' ? 'results' : kart.spectator ? 'spectating'
        : world.phase === 'lobby' ? 'lobby' : world.ranked ? 'ranked-race' : world.practice ? 'practice' : 'racing';
      players.push({ id: kart.playerId || `guest:${kart.id}`, name: kart.name, status });
    }
  }
  return players;
}

export async function handlePresenceRequest(req: IncomingMessage, res: ServerResponse, registry: PresenceRegistry,
  readBody: () => Promise<Record<string, unknown>>) {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const method = req.method ?? 'GET';
  if (!['GET', 'POST', 'DELETE'].includes(method)) { req.resume(); send(405, { error: 'Méthode non autorisée.' }); return; }
  if (req.headers.origin) {
    let valid = false;
    try { valid = new URL(req.headers.origin).host === req.headers.host; } catch { /* Reject invalid origins. */ }
    if (!valid) { req.resume(); send(403, { error: 'Ouvrez la liste depuis la page du jeu.' }); return; }
  }
  try {
    if (method !== 'GET') {
      const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
      const profile = (await playerStore()).authenticate(token);
      if (!profile) { req.resume(); send(401, { error: 'Profil absent ou expiré.' }); return; }
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        req.resume(); send(415, { error: 'Format JSON attendu.' }); return;
      }
      const body = await readBody();
      if (typeof body.clientId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.clientId)) {
        send(400, { error: 'Session de présence invalide.' }); return;
      }
      if (method === 'DELETE') registry.leave(body.clientId, profile.id);
      else registry.heartbeat(body.clientId, profile);
    }
    send(200, registry.snapshot(await authoritativePlayers()));
  } catch (error) {
    send(400, { error: error instanceof Error ? error.message : 'Liste indisponible.' });
  }
}
