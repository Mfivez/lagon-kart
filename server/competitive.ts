import { randomUUID } from 'node:crypto';
import { INITIAL_MMR, seasonId, type ReplayData, type ReplayDriver, type ReplayFrame } from '../shared/progression.js';

export interface RatingEntry { playerId: string; mmr: number; rank: number; finished: boolean }
/** Pairwise Elo, normalised to one race. All ratings use the same pre-race snapshot. */
export function calculateMmr(entries: readonly RatingEntry[]): Map<string, number> {
  if (entries.length < 2) return new Map(entries.map(entry => [entry.playerId, entry.mmr]));
  return new Map(entries.map(entry => {
    let delta = 0;
    for (const other of entries) {
      if (other === entry) continue;
      const expected = 1 / (1 + 10 ** ((other.mmr - entry.mmr) / 400));
      const score = entry.finished !== other.finished ? Number(entry.finished)
        : !entry.finished || entry.rank === other.rank ? 0.5 : Number(entry.rank < other.rank);
      delta += score - expected;
    }
    return [entry.playerId, Math.max(0, Math.min(4000, Math.round(entry.mmr + 40 * delta / (entries.length - 1))))];
  }));
}

type WaitingPlayer = { playerId: string; mmr: number; joinedAt: number; lastSeen: number; matchId?: string };
export interface MatchGroup { id: string; players: { playerId: string; mmr: number }[]; averageMmr: number; createdAt: number }
type PendingMatch = MatchGroup & { roomId?: string };
export type QueueStatus = { state: 'idle' } | { state: 'queued'; joinedAt: number; waitSeconds: number; ratingWindow: number }
  | { state: 'matching'; matchId: string } | { state: 'matched'; matchId: string; roomId: string };

/** One authoritative queue per server instance. It never exposes somebody else's identity token. */
export class MatchmakingQueue {
  private readonly players = new Map<string, WaitingPlayer>();
  private readonly matches = new Map<string, PendingMatch>();

  constructor(private readonly capacity = 512) {}

  join(playerId: string, mmr = INITIAL_MMR, now = Date.now()): QueueStatus {
    this.expire(now);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(playerId) || !Number.isFinite(mmr) || mmr < 0 || mmr > 4000) throw new Error('Profil de classement invalide.');
    const existing = this.players.get(playerId);
    if (existing) { existing.lastSeen = now; return this.poll(playerId, now); }
    if (this.players.size >= this.capacity) throw new Error('La file classée est pleine. Réessayez dans un instant.');
    this.players.set(playerId, { playerId, mmr: Math.round(mmr), joinedAt: now, lastSeen: now });
    return this.poll(playerId, now);
  }

  poll(playerId: string, now = Date.now()): QueueStatus {
    this.expire(now);
    const player = this.players.get(playerId);
    if (!player) return { state: 'idle' };
    player.lastSeen = now;
    if (player.matchId) {
      const match = this.matches.get(player.matchId);
      if (match?.roomId) return { state: 'matched', matchId: match.id, roomId: match.roomId };
      if (match) return { state: 'matching', matchId: match.id };
      delete player.matchId;
    }
    return { state: 'queued', joinedAt: player.joinedAt, waitSeconds: Math.floor(Math.max(0, now - player.joinedAt) / 1000),
      ratingWindow: this.window(player, now) };
  }

  cancel(playerId: string, now = Date.now()): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    // Release the whole not-yet-started group so the remaining queued players
    // cannot be stranded in a room waiting for a cancelled reservation.
    // The HTTP/room layer closes any already-created lobby separately.
    if (player.matchId) this.releaseMatch(player.matchId, now);
    this.players.delete(playerId);
    return true;
  }

  popMatches(now = Date.now()): MatchGroup[] {
    this.expire(now);
    const available = [...this.players.values()].filter(player => !player.matchId).sort((a, b) => a.joinedAt - b.joinedAt || a.playerId.localeCompare(b.playerId));
    const result: MatchGroup[] = [];
    for (const first of available) {
      if (first.matchId || now - first.joinedAt < 3000) continue;
      const group = [first, ...available.filter(other => other !== first && !other.matchId &&
        Math.abs(other.mmr - first.mmr) <= Math.min(this.window(first, now), this.window(other, now)))
        .sort((a, b) => Math.abs(a.mmr - first.mmr) - Math.abs(b.mmr - first.mmr) || a.joinedAt - b.joinedAt).slice(0, 7)];
      if (group.length < 2) continue;
      const match: PendingMatch = { id: randomUUID(), players: group.map(player => ({ playerId: player.playerId, mmr: player.mmr })),
        averageMmr: Math.round(group.reduce((sum, player) => sum + player.mmr, 0) / group.length), createdAt: now };
      for (const player of group) player.matchId = match.id;
      this.matches.set(match.id, match); result.push(structuredClone(match));
    }
    return result;
  }

  assignMatch(matchId: string, roomId: string): boolean {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(roomId)) throw new Error('Salon invalide.');
    const match = this.matches.get(matchId);
    if (!match) return false;
    match.roomId = roomId; return true;
  }

  releaseMatch(matchId: string, now = Date.now()): void {
    if (!this.matches.delete(matchId)) return;
    for (const player of this.players.values()) if (player.matchId === matchId) { delete player.matchId; player.lastSeen = now; }
  }

  /** Call after the reserved player joins, so they can queue again after that race. */
  consume(playerId: string, roomId: string): boolean {
    const player = this.players.get(playerId), match = player?.matchId ? this.matches.get(player.matchId) : undefined;
    if (!player || match?.roomId !== roomId) return false;
    this.players.delete(playerId); return true;
  }

  get size() { return this.players.size; }
  private window(player: WaitingPlayer, now: number) { return Math.min(1200, 125 + Math.floor(Math.max(0, now - player.joinedAt) / 1000) * 20); }
  private expire(now: number) {
    for (const [id, player] of this.players) if (now - player.lastSeen > 45_000) this.players.delete(id);
    for (const [id, match] of this.matches) if (now - match.createdAt > 90_000 || ![...this.players.values()].some(player => player.matchId === id)) {
      this.matches.delete(id);
      for (const player of this.players.values()) if (player.matchId === id) delete player.matchId;
    }
  }
}

export interface ReplaySample {
  playerId: string; name: string; color?: string; x: number; z: number; angle: number; speed: number;
  lap: number; rank: number; finished: boolean; finishTime: number; spectator?: boolean;
  boost?: number; invincible?: number; shield?: number; stun?: number;
}
export interface ReplayRecorderOptions { id: string; trackId: string; ranked?: boolean; eventLevel?: number; createdAt?: number; sampleIntervalMs?: number }
export class ReplayRecorder {
  private readonly drivers = new Map<string, ReplayDriver>();
  private lastSample = -Infinity;
  private readonly interval: number;
  private readonly createdAt: number;

  constructor(private readonly options: ReplayRecorderOptions) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(options.id)) throw new Error('Identifiant de replay invalide.');
    this.interval = Math.max(200, Math.min(1000, options.sampleIntervalMs ?? 200));
    this.createdAt = options.createdAt ?? Date.now();
  }

  sample(time: number, players: readonly ReplaySample[], force = false): void {
    const milliseconds = Math.round(time * 1000);
    if (!Number.isFinite(time) || milliseconds < 0 || milliseconds > 360_000 || (!force && milliseconds - this.lastSample < this.interval)) return;
    if (milliseconds < this.lastSample) return;
    this.lastSample = milliseconds;
    for (const player of players.slice(0, 8)) {
      if (player.spectator || !/^[A-Za-z0-9_-]{1,80}$/.test(player.playerId) ||
        ![player.x, player.z, player.angle, player.speed, player.lap, player.rank, player.finishTime].every(Number.isFinite)) continue;
      let driver = this.drivers.get(player.playerId);
      if (!driver) {
        if (this.drivers.size >= 8) continue;
        driver = { playerId: player.playerId, name: player.name.slice(0, 18), color: /^#[a-f0-9]{6}$/i.test(player.color ?? '') ? player.color! : '#eef4ff',
          rank: player.rank, finished: false, finishTime: 0, frames: [] };
        this.drivers.set(player.playerId, driver);
      }
      driver.rank = Math.max(1, Math.min(8, Math.round(player.rank)));
      driver.finished = player.finished; driver.finishTime = player.finished ? Math.max(0, Math.min(360, player.finishTime)) : 0;
      if (driver.frames.length >= 1802) continue;
      const flags = Number((player.boost ?? 0) > 0) | Number((player.invincible ?? 0) > 0) << 1 |
        Number((player.shield ?? 0) > 0) << 2 | Number((player.stun ?? 0) > 0) << 3 | Number(player.finished) << 4;
      const frame: ReplayFrame = [milliseconds, Math.round(Math.max(-10_000, Math.min(10_000, player.x)) * 100),
        Math.round(Math.max(-10_000, Math.min(10_000, player.z)) * 100),
        Math.round(Math.atan2(Math.sin(player.angle), Math.cos(player.angle)) * 1000),
        Math.round(Math.max(-20, Math.min(100, player.speed)) * 100), Math.max(0, Math.min(3, Math.round(player.lap))), flags];
      if (driver.frames.at(-1)?.[0] === milliseconds) driver.frames[driver.frames.length - 1] = frame;
      else driver.frames.push(frame);
    }
  }

  finish(time: number, players: readonly ReplaySample[]): ReplayData {
    this.sample(time, players, true);
    return { version: 1, id: this.options.id, trackId: this.options.trackId, createdAt: this.createdAt,
      durationMs: Math.max(0, Math.min(360_000, Math.round(time * 1000))), season: seasonId(new Date(this.createdAt)),
      ranked: this.options.ranked === true, eventLevel: Math.max(0, Math.min(3, this.options.eventLevel ?? 0)), drivers: structuredClone([...this.drivers.values()]) };
  }
}
