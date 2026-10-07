import { PRESENCE_EXPIRY_MS, type OnlinePlayer, type PresenceSnapshot, type PresenceStatus } from '../shared/presence.js';

type Session = { playerId: string; name: string; seenAt: number };
const priority: Record<PresenceStatus, number> = {
  home: 0, 'ranked-search': 11, 'ranked-ready': 12, lobby: 4, results: 5, spectating: 6,
  practice: 7, racing: 8, 'ranked-race': 9,
};

/** Ephemeral tab leases. A profile with several tabs/devices is still one pilot. */
export class PresenceRegistry {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly now = Date.now, private readonly capacity = 4096) {}

  heartbeat(clientId: string, player: { id: string; name: string }) {
    this.expire();
    if (!this.sessions.has(clientId) && this.sessions.size >= this.capacity) throw new Error('La liste des joueurs est momentanément pleine.');
    // clientId is an unguessable per-document capability and is never published.
    // Rebinding it when signing in removes this tab's previous guest immediately.
    this.sessions.set(clientId, { playerId: player.id, name: player.name, seenAt: this.now() });
  }

  leave(clientId: string, playerId: string) {
    if (this.sessions.get(clientId)?.playerId === playerId) this.sessions.delete(clientId);
  }

  snapshot(authoritative: readonly OnlinePlayer[] = []): PresenceSnapshot {
    this.expire();
    const players = new Map<string, OnlinePlayer>();
    for (const session of this.sessions.values()) players.set(session.playerId,
      { id: session.playerId, name: session.name, status: 'home' });
    for (const player of authoritative) {
      const previous = players.get(player.id);
      if (!previous || priority[player.status] >= priority[previous.status]) players.set(player.id, { ...player });
    }
    const sorted = [...players.values()].sort((a, b) => Number(b.status === 'ranked-search') - Number(a.status === 'ranked-search')
      || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    return { players: sorted, connected: sorted.length, searchingRanked: sorted.filter(player => player.status === 'ranked-search').length };
  }

  private expire() {
    const now = this.now();
    for (const [id, session] of this.sessions) if (now - session.seenAt >= PRESENCE_EXPIRY_MS) this.sessions.delete(id);
  }
}
