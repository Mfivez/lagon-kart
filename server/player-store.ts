import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { isTrackId, TRACK_LAYOUT_REVISION, getTrackLapCount, getTrackReplayTimeLimit, MAX_CUSTOM_REPLAY_SECONDS } from '../shared/track.js';
import { isCustomTrackRuntimeId } from '../shared/custom-tracks.js';
import { INITIAL_MMR, careerLevel, championshipById, rankForMmr, seasonId,
  type GhostData, type LeaderboardEntry, type PlayerProfile, type PlayerStats,
  type ReplayData, type ReplaySummary, type SeasonStats } from '../shared/progression.js';
import { calculateMmr } from './competitive.js';
import { hashPassword, validatePassword, validPasswordHash, verifyPassword, type PasswordHash } from './passwords.js';

interface StoredPlayer {
  id: string; tokenHash?: string; sessionTokenHashes?: string[]; name: string; createdAt: number; xp: number;
  username?: string; passwordHash?: PasswordHash;
  completedChampionships: string[]; stats: PlayerStats; seasons: SeasonStats[];
}
interface StoreData {
  version: 1; players: StoredPlayer[]; raceReceipts: { id: string; at: number }[];
  receiptFloor: number; replays: ReplaySummary[];
}
export interface RaceEntry { playerId: string; rank: number; finished: boolean; finishTime: number }
export interface RaceRecord { id: string; trackId: string; ranked: boolean; finishedAt: number; entries: RaceEntry[] }
export interface PlayerStoreOptions { now?: () => number; maxPlayers?: number; maxReplays?: number }
export class AccountError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'AccountError'; }
}
const MAX_REPLAY_BYTES = 2 * 1024 * 1024;
const MAX_SESSIONS = 16;
// Historical account statistics must remain readable if a custom source needs
// repair. Known race/replay writes use the exact immutable track's tighter limit.
const storedTimeLimit = (trackId: string) => isCustomTrackRuntimeId(trackId) ? MAX_CUSTOM_REPLAY_SECONDS : 360;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const tokenFingerprint = (token: unknown): string | null => typeof token === 'string' && /^lk_[A-Za-z0-9_-]{43}$/.test(token) ? hash(token) : null;
const tokenHashes = (player: StoredPlayer): string[] => [...(player.tokenHash ? [player.tokenHash] : []), ...(player.sessionTokenHashes ?? [])];
function username(value: unknown): string {
  if (typeof value !== 'string' || value.length > 256) throw new Error('Identifiant invalide.');
  const cleaned = value.normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}._-]+$/u.test(cleaned) || [...cleaned].length < 3 || [...cleaned].length > 24)
    throw new Error('L’identifiant doit contenir 3 à 24 lettres, chiffres, points, tirets ou traits de soulignement.');
  return cleaned;
}
const usernameKey = (value: string): string => value.toLowerCase().normalize('NFKC');
function setTokenHashes(player: StoredPlayer, hashes: string[]): void {
  const bounded = hashes.slice(-MAX_SESSIONS);
  if (bounded.length) player.tokenHash = bounded[0]; else delete player.tokenHash;
  player.sessionTokenHashes = bounded.slice(1);
}
function name(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Pseudo invalide.');
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 18);
  if (!cleaned) throw new Error('Choisissez un pseudo.');
  return cleaned;
}
function emptyStats(): PlayerStats { return { races: 0, finishes: 0, wins: 0, podiums: 0, totalRaceTime: 0, bestTimes: {} }; }
function summary(replay: ReplayData): ReplaySummary {
  return { id: replay.id, trackId: replay.trackId, trackRevision: replay.trackRevision ?? 1, createdAt: replay.createdAt, durationMs: replay.durationMs, ranked: replay.ranked, eventLevel: replay.eventLevel ?? 0,
    drivers: replay.drivers.map(({ playerId, name, finishTime, finished, rank }) => ({ playerId, name, finishTime, finished, rank })) };
}

/** Validation also runs when reading disk, not only on trusted recorder output. */
export function validateReplay(value: unknown): ReplayData {
  if (!value || typeof value !== 'object') throw new Error('Replay invalide.');
  const replay = value as ReplayData;
  const maximumTime = getTrackReplayTimeLimit(replay.trackId);
  const laps = getTrackLapCount(replay.trackId);
  if (replay.version !== 1 || !identifier(replay.id) || !isTrackId(replay.trackId) || !integer(replay.trackRevision ?? 1, 1, 1000) ||
    !integer(replay.createdAt, 0, 8_640_000_000_000_000) || !integer(replay.durationMs, 0, maximumTime * 1000) ||
    replay.season !== seasonId(new Date(replay.createdAt)) || typeof replay.ranked !== 'boolean' || !integer(replay.eventLevel ?? 0, 0, 3) ||
    !Array.isArray(replay.drivers) || replay.drivers.length < 1 || replay.drivers.length > 8) throw new Error('En-tête de replay invalide.');
  const ids = new Set<string>();
  for (const driver of replay.drivers) {
    if (!driver || !identifier(driver.playerId) || ids.has(driver.playerId) || name(driver.name) !== driver.name ||
      !/^#[a-f0-9]{6}$/i.test(driver.color) || !integer(driver.rank, 1, 8) || typeof driver.finished !== 'boolean' ||
      !Number.isFinite(driver.finishTime) || driver.finishTime < 0 || driver.finishTime > maximumTime ||
      (!driver.finished && driver.finishTime !== 0) || !Array.isArray(driver.frames) || driver.frames.length < 1 || driver.frames.length > 1802)
      throw new Error('Pilote de replay invalide.');
    ids.add(driver.playerId);
    let previous = -1;
    for (const frame of driver.frames) {
      if (!Array.isArray(frame) || frame.length !== 7 || !frame.every(Number.isSafeInteger) || frame[0] <= previous ||
        frame[0] < 0 || frame[0] > replay.durationMs || Math.abs(frame[1]) > 1_000_000 || Math.abs(frame[2]) > 1_000_000 ||
        Math.abs(frame[3]) > 3142 || frame[4] < -2000 || frame[4] > 10_000 || frame[5] < 0 || frame[5] > laps || frame[6] < 0 || frame[6] > 31)
        throw new Error('Trajectoire de replay invalide.');
      previous = frame[0];
    }
    if (driver.finished && (driver.finishTime <= 0 || driver.finishTime * 1000 > replay.durationMs + 1 || driver.frames.at(-1)![5] < laps))
      throw new Error('Arrivée de replay invalide.');
  }
  // Explicit projection discards any incidental private fields a caller attached.
  return { version: 1, id: replay.id, trackId: replay.trackId, trackRevision: replay.trackRevision ?? 1, createdAt: replay.createdAt, durationMs: replay.durationMs,
    season: replay.season, ranked: replay.ranked, eventLevel: replay.eventLevel ?? 0, drivers: replay.drivers.map(driver => ({
      playerId: driver.playerId, name: driver.name, color: driver.color, rank: driver.rank,
      finished: driver.finished, finishTime: driver.finishTime, frames: driver.frames.map(frame => [...frame]),
    })) };
}

/** Single-process JSON persistence with serialised atomic commits. Mount its directory in Docker. */
export class PlayerStore {
  private data: StoreData = { version: 1, players: [], raceReceipts: [], receiptFloor: -1, replays: [] };
  private tail: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;
  private readonly maxPlayers: number;
  private readonly maxReplays: number;
  private readonly directory: string;

  private constructor(directory: string, options: PlayerStoreOptions) {
    this.directory = resolve(directory); this.now = options.now ?? Date.now;
    this.maxPlayers = Math.max(1, Math.min(10_000, options.maxPlayers ?? 5000));
    this.maxReplays = Math.max(16, Math.min(100, options.maxReplays ?? 40));
  }

  static async open(directory: string, options: PlayerStoreOptions = {}): Promise<PlayerStore> {
    const store = new PlayerStore(directory, options);
    await mkdir(join(store.directory, 'replays'), { recursive: true, mode: 0o700 });
    try {
      const file = join(store.directory, 'players.json');
      if ((await stat(file)).size > 25 * 1024 * 1024) throw new Error('Le registre des joueurs dépasse sa taille maximale.');
      const loaded: unknown = JSON.parse(await readFile(file, 'utf8'));
      store.data = store.validateStore(loaded);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Le registre des joueurs est illisible ; sauvegarde conservée.', { cause: error });
    }
    return store;
  }

  async createPlayer(displayName: string): Promise<{ token: string; profile: PlayerProfile }> {
    const cleaned = name(displayName), token = 'lk_' + randomBytes(32).toString('base64url');
    return this.transaction(data => {
      if (data.players.length >= this.maxPlayers) throw new Error('La capacité de profils de ce serveur est atteinte.');
      const player: StoredPlayer = { id: randomUUID(), tokenHash: hash(token), name: cleaned, createdAt: this.now(), xp: 0,
        completedChampionships: [], stats: emptyStats(), seasons: [] };
      data.players.push(player);
      return { token, profile: this.publicProfile(player) };
    });
  }

  authenticate(token: unknown): PlayerProfile | null {
    const fingerprint = tokenFingerprint(token);
    if (!fingerprint) return null;
    const player = this.data.players.find(candidate => tokenHashes(candidate).includes(fingerprint));
    return player ? this.publicProfile(player) : null;
  }

  async registerAccount(loginName: unknown, password: unknown, token?: unknown, displayName?: unknown): Promise<{ token: string; profile: PlayerProfile }> {
    let cleaned: string, cleanedName: string, secret: string;
    try { cleaned = username(loginName); secret = validatePassword(password); cleanedName = name(displayName === undefined ? cleaned : displayName); }
    catch (error) { throw new AccountError((error as Error).message, 400); }
    const key = usernameKey(cleaned);
    const linking = token !== undefined && token !== null, fingerprint = tokenFingerprint(token);
    if (linking && !fingerprint) throw new AccountError('Session expirée. Reconnectez-vous avant de créer le compte.', 401);
    const passwordHash = await hashPassword(secret), session = 'lk_' + randomBytes(32).toString('base64url');
    return this.transaction(data => {
      if (data.players.some(player => player.username !== undefined && usernameKey(player.username) === key))
        throw new AccountError('Cet identifiant est déjà utilisé.', 409);
      let player = fingerprint ? data.players.find(candidate => tokenHashes(candidate).includes(fingerprint)) : undefined;
      if (linking && !player) throw new AccountError('Session expirée. Reconnectez-vous avant de créer le compte.', 401);
      if (player?.username !== undefined) throw new AccountError('Ce profil possède déjà un compte.', 409);
      if (!player) {
        if (data.players.length >= this.maxPlayers) throw new AccountError('La capacité de profils de ce serveur est atteinte.', 429);
        player = { id: randomUUID(), name: cleanedName, createdAt: this.now(), xp: 0,
          completedChampionships: [], stats: emptyStats(), seasons: [] };
        data.players.push(player);
      }
      player.username = cleaned; player.passwordHash = passwordHash;
      setTokenHashes(player, [...tokenHashes(player), hash(session)]);
      return { token: session, profile: this.publicProfile(player) };
    });
  }

  async loginAccount(loginName: unknown, password: unknown): Promise<{ token: string; profile: PlayerProfile }> {
    let cleaned: string, secret: string;
    try { cleaned = username(loginName); secret = validatePassword(password); }
    catch { throw new AccountError('Identifiant ou mot de passe incorrect.', 401); }
    await this.tail;
    const key = usernameKey(cleaned), player = this.data.players.find(candidate => candidate.username !== undefined && usernameKey(candidate.username) === key);
    if (!await verifyPassword(secret, player?.passwordHash) || !player) throw new AccountError('Identifiant ou mot de passe incorrect.', 401);
    const token = 'lk_' + randomBytes(32).toString('base64url');
    return this.transaction(data => {
      const current = this.requirePlayer(data, player.id);
      setTokenHashes(current, [...tokenHashes(current), hash(token)]);
      return { token, profile: this.publicProfile(current) };
    });
  }

  async logout(token: unknown): Promise<void> {
    const fingerprint = tokenFingerprint(token);
    if (!fingerprint) return;
    await this.transaction(data => {
      const player = data.players.find(candidate => tokenHashes(candidate).includes(fingerprint));
      if (player) setTokenHashes(player, tokenHashes(player).filter(candidate => candidate !== fingerprint));
    });
  }

  getProfile(playerId: string): PlayerProfile | null {
    const player = this.data.players.find(candidate => candidate.id === playerId);
    return player ? this.publicProfile(player) : null;
  }

  async updateName(playerId: string, displayName: string): Promise<PlayerProfile> {
    const cleaned = name(displayName);
    return this.transaction(data => { const player = this.requirePlayer(data, playerId); player.name = cleaned; return this.publicProfile(player); });
  }

  async recordRace(race: RaceRecord): Promise<{ recorded: boolean; profiles: PlayerProfile[] }> {
    if (!race || !identifier(race.id) || !isTrackId(race.trackId) || typeof race.ranked !== 'boolean' ||
      !integer(race.finishedAt, 0, 8_640_000_000_000_000) || !Array.isArray(race.entries) || race.entries.length < 1 || race.entries.length > 8 ||
      new Set(race.entries.map(entry => entry.playerId)).size !== race.entries.length) throw new Error('Résultat de course invalide.');
    for (const entry of race.entries) if (!identifier(entry.playerId) || !integer(entry.rank, 1, 8) || typeof entry.finished !== 'boolean' ||
      !Number.isFinite(entry.finishTime) || entry.finishTime < 0 || entry.finishTime > getTrackReplayTimeLimit(race.trackId) || (entry.finished && entry.finishTime <= 0))
      throw new Error('Résultat de pilote invalide.');
    if (race.finishedAt > this.now() + 60_000 || race.finishedAt < this.now() - 86_400_000)
      throw new Error('Le résultat de course est trop ancien ou daté dans le futur.');
    return this.transaction(data => {
      const players = race.entries.map(entry => this.requirePlayer(data, entry.playerId));
      if (data.raceReceipts.some(receipt => receipt.id === race.id) || race.finishedAt <= data.receiptFloor)
        return { recorded: false, profiles: players.map(player => this.publicProfile(player)) };
      if (race.ranked && players.length < 2) throw new Error('Une course classée nécessite deux identités distinctes.');
      // A delayed completion keeps the season in which that race ended.
      const season = seasonId(new Date(race.finishedAt));
      const seasons = players.map(player => this.ensureSeason(player, season));
      const ratings = race.ranked ? calculateMmr(race.entries.map((entry, index) => ({ ...entry, mmr: seasons[index]!.mmr }))) : new Map<string, number>();
      race.entries.forEach((entry, index) => {
        const player = players[index]!, stats = player.stats;
        stats.races++;
        player.xp += entry.finished ? 30 + (entry.rank === 1 ? 15 : entry.rank <= 3 ? 5 : 0) : 5;
        if (entry.finished) {
          stats.finishes++; stats.wins += Number(entry.rank === 1); stats.podiums += Number(entry.rank <= 3);
          stats.totalRaceTime += entry.finishTime;
          stats.bestTimes[race.trackId] = Math.min(stats.bestTimes[race.trackId] ?? Infinity, entry.finishTime);
        }
        if (race.ranked) {
          const ranked = seasons[index]!;
          ranked.races++; ranked.wins += Number(entry.finished && entry.rank === 1);
          ranked.mmr = ratings.get(player.id)!; ranked.peakMmr = Math.max(ranked.peakMmr, ranked.mmr);
        }
      });
      data.raceReceipts.push({ id: race.id, at: race.finishedAt });
      data.raceReceipts.sort((a, b) => a.at - b.at);
      if (data.raceReceipts.length > 20_000) {
        const removed = data.raceReceipts.splice(0, data.raceReceipts.length - 20_000);
        data.receiptFloor = Math.max(data.receiptFloor, removed.at(-1)!.at);
      }
      return { recorded: true, profiles: players.map(player => this.publicProfile(player)) };
    });
  }

  /** Call exclusively from authoritative tournament results, never from a client payload. */
  async completeChampionship(playerId: string, championshipId: string, rank: number, finishedRaces: number): Promise<PlayerProfile> {
    const cup = championshipById(championshipId);
    if (!cup || !integer(rank, 1, 8) || !integer(finishedRaces, 0, cup.tracks.length)) throw new Error('Résultat de championnat invalide.');
    return this.transaction(data => {
      const player = this.requirePlayer(data, playerId);
      if (careerLevel(player.completedChampionships) < cup.unlockLevel) throw new Error('Ce championnat est encore verrouillé.');
      if (rank <= 3 && finishedRaces === cup.tracks.length && !player.completedChampionships.includes(cup.id)) {
        player.completedChampionships.push(cup.id); player.xp += cup.xp;
      }
      return this.publicProfile(player);
    });
  }

  leaderboard(limit = 50, season = seasonId(new Date(this.now()))): LeaderboardEntry[] {
    if (!/^\d{4}-Q[1-4]$/.test(season)) throw new Error('Saison invalide.');
    const count = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.round(limit) : 50));
    return this.data.players.flatMap(player => {
      const ranked = player.seasons.find(entry => entry.season === season);
      return ranked && ranked.races > 0 ? [{ playerId: player.id, name: player.name, mmr: ranked.mmr, rank: rankForMmr(ranked.mmr), races: ranked.races, wins: ranked.wins }] : [];
    }).sort((a, b) => b.mmr - a.mmr || b.wins - a.wins || b.races - a.races || a.playerId.localeCompare(b.playerId))
      .slice(0, count).map((row, index) => ({ ...row, position: index + 1 }));
  }

  listReplays(playerId?: string, limit = 20): ReplaySummary[] {
    const count = Math.max(1, Math.min(100, Number.isFinite(limit) ? Math.round(limit) : 20));
    return structuredClone(this.data.replays.filter(replay => !playerId || replay.drivers.some(driver => driver.playerId === playerId))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, count));
  }

  async saveReplay(value: ReplayData): Promise<ReplaySummary> {
    const replay = validateReplay(value), text = JSON.stringify(replay);
    if (Buffer.byteLength(text) > MAX_REPLAY_BYTES) throw new Error('Le replay dépasse 2 Mio.');
    return this.serial(async () => {
      const existing = this.data.replays.find(entry => entry.id === replay.id);
      if (existing) return structuredClone(existing);
      const filename = join(this.directory, 'replays', `${replay.id}.json`);
      await this.atomicWrite(filename, text);
      const next = structuredClone(this.data), info = summary(replay);
      next.replays.push(info);
      const keep = this.replayRetention(next.replays), removed = next.replays.filter(entry => !keep.has(entry.id));
      next.replays = next.replays.filter(entry => keep.has(entry.id));
      try { await this.commit(next); }
      catch (error) { await rm(filename, { force: true }).catch(() => {}); throw error; }
      await Promise.all(removed.map(entry => rm(join(this.directory, 'replays', `${entry.id}.json`), { force: true }).catch(() => {})));
      return structuredClone(info);
    });
  }

  async getReplay(id: string): Promise<ReplayData | null> {
    if (!identifier(id) || !this.data.replays.some(replay => replay.id === id)) return null;
    const filename = join(this.directory, 'replays', `${id}.json`);
    if ((await stat(filename)).size > MAX_REPLAY_BYTES) throw new Error('Replay trop volumineux.');
    return validateReplay(JSON.parse(await readFile(filename, 'utf8')));
  }

  async bestGhost(trackId: string, rankedOnly = false, eventLevel?: number): Promise<GhostData | null> {
    if (!isTrackId(trackId)) throw new Error('Circuit inconnu.');
    const best = this.data.replays.filter(replay => (replay.trackRevision ?? 1) === TRACK_LAYOUT_REVISION && replay.trackId === trackId && (!rankedOnly || replay.ranked) && (eventLevel === undefined || (replay.eventLevel ?? 0) === eventLevel))
      .flatMap(replay => replay.drivers.filter(driver => driver.finished && driver.finishTime > 0).map(driver => ({ replay, driver })))
      .sort((a, b) => a.driver.finishTime - b.driver.finishTime || a.replay.createdAt - b.replay.createdAt)[0];
    if (!best) return null;
    const replay = await this.getReplay(best.replay.id), driver = replay?.drivers.find(candidate => candidate.playerId === best.driver.playerId);
    if (!driver) return null;
    return { version: 1, replayId: best.replay.id, trackId, trackRevision: replay!.trackRevision, playerId: driver.playerId, name: driver.name,
      color: driver.color, finishTime: driver.finishTime, eventLevel: replay?.eventLevel ?? 0, frames: driver.frames };
  }

  async flush(): Promise<void> { await this.tail; }

  private publicProfile(player: StoredPlayer): PlayerProfile {
    const season = seasonId(new Date(this.now()));
    const ranked = player.seasons.find(entry => entry.season === season) ?? this.freshSeason(player, season);
    return structuredClone({ id: player.id, name: player.name, ...(player.username === undefined ? {} : { username: player.username }), createdAt: player.createdAt, xp: player.xp,
      careerLevel: careerLevel(player.completedChampionships), completedChampionships: player.completedChampionships,
      stats: player.stats, season, mmr: ranked.mmr, rank: rankForMmr(ranked.mmr), ranked });
  }
  private freshSeason(player: StoredPlayer, season: string): SeasonStats {
    const previous = [...player.seasons].filter(entry => entry.season < season).sort((a, b) => b.season.localeCompare(a.season))[0];
    const mmr = previous ? Math.round(INITIAL_MMR + (previous.mmr - INITIAL_MMR) * 0.5) : INITIAL_MMR;
    return { season, mmr, races: 0, wins: 0, peakMmr: mmr };
  }
  private ensureSeason(player: StoredPlayer, season: string): SeasonStats {
    let ranked = player.seasons.find(entry => entry.season === season);
    if (!ranked) { ranked = this.freshSeason(player, season); player.seasons.push(ranked); player.seasons.sort((a, b) => b.season.localeCompare(a.season)); player.seasons = player.seasons.slice(0, 4); }
    return ranked;
  }
  private requirePlayer(data: StoreData, playerId: string): StoredPlayer {
    const player = data.players.find(candidate => candidate.id === playerId);
    if (!player) throw new Error('Profil introuvable.');
    return player;
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation); this.tail = next.catch(() => {}); return next;
  }
  private transaction<T>(operation: (next: StoreData) => T): Promise<T> {
    return this.serial(async () => { const next = structuredClone(this.data), result = operation(next); await this.commit(next); return result; });
  }
  private async commit(next: StoreData): Promise<void> {
    await this.atomicWrite(join(this.directory, 'players.json'), JSON.stringify(next)); this.data = next;
  }
  private async atomicWrite(filename: string, content: string): Promise<void> {
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, filename);
    } finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
  private replayRetention(replays: ReplaySummary[]): Set<string> {
    // Prefer each track's fastest ranked ghost, then its open ghost and recent
    // races. The cap remains strict even when new circuits add more potential
    // ghost records than the configured number of files.
    const fastest = new Map<string, { id: string; time: number }>();
    for (const replay of replays) for (const driver of replay.drivers) if ((replay.trackRevision ?? 1) === TRACK_LAYOUT_REVISION && driver.finished && driver.finishTime > 0) {
      for (const key of [replay.trackId, ...(replay.ranked ? [replay.trackId + ':ranked'] : [])])
        if (driver.finishTime < (fastest.get(key)?.time ?? Infinity)) fastest.set(key, { id: replay.id, time: driver.finishTime });
    }
    const dates = new Map(replays.map(replay => [replay.id, replay.createdAt]));
    const candidates = [...fastest.entries()].sort(([a, first], [b, second]) =>
      Number(b.endsWith(':ranked')) - Number(a.endsWith(':ranked')) || (dates.get(second.id) ?? 0) - (dates.get(first.id) ?? 0));
    const keep = new Set<string>();
    for (const [, record] of candidates) { if (keep.size >= this.maxReplays) break; keep.add(record.id); }
    for (const replay of [...replays].sort((a, b) => b.createdAt - a.createdAt)) { if (keep.size >= this.maxReplays) break; keep.add(replay.id); }
    return keep;
  }
  private validateStore(value: unknown): StoreData {
    if (!value || typeof value !== 'object') throw new Error('Registre invalide.');
    const data = value as StoreData;
    if (data.version !== 1 || !Array.isArray(data.players) || data.players.length > this.maxPlayers ||
      !Array.isArray(data.raceReceipts) || data.raceReceipts.length > 20_000 || !integer(data.receiptFloor, -1, 8_640_000_000_000_000) ||
      !Array.isArray(data.replays) || data.replays.length > this.maxReplays) throw new Error('Structure du registre invalide.');
    const ids = new Set<string>(), hashes = new Set<string>(), usernames = new Set<string>();
    for (const player of data.players) {
      if (!player || typeof player !== 'object' || !identifier(player.id) || ids.has(player.id) || name(player.name) !== player.name ||
        !integer(player.createdAt, 0, 8_640_000_000_000_000) || !integer(player.xp, 0, Number.MAX_SAFE_INTEGER) ||
        !Array.isArray(player.completedChampionships) || player.completedChampionships.length > 6 ||
        new Set(player.completedChampionships).size !== player.completedChampionships.length || player.completedChampionships.some(id => !championshipById(id)) ||
        !Array.isArray(player.seasons) || player.seasons.length > 4 || !player.stats) throw new Error('Profil sauvegardé invalide.');
      if (player.tokenHash !== undefined && (typeof player.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(player.tokenHash)) ||
        player.sessionTokenHashes !== undefined && (!Array.isArray(player.sessionTokenHashes) || player.sessionTokenHashes.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) ||
        player.tokenHash === undefined && player.sessionTokenHashes === undefined)
        throw new Error('Sessions sauvegardées invalides.');
      const sessions = tokenHashes(player);
      if (sessions.length > MAX_SESSIONS || sessions.some(session => hashes.has(session)) || new Set(sessions).size !== sessions.length)
        throw new Error('Sessions sauvegardées invalides.');
      sessions.forEach(session => hashes.add(session));
      if (player.username !== undefined) {
        if (username(player.username) !== player.username || !validPasswordHash(player.passwordHash) || usernames.has(usernameKey(player.username)))
          throw new Error('Compte sauvegardé invalide.');
        usernames.add(usernameKey(player.username));
      } else if (player.passwordHash !== undefined) throw new Error('Compte sauvegardé invalide.');
      ids.add(player.id);
      const stats = player.stats;
      if (![stats.races, stats.finishes, stats.wins, stats.podiums].every(count => integer(count, 0, Number.MAX_SAFE_INTEGER)) ||
        !Number.isFinite(stats.totalRaceTime) || stats.totalRaceTime < 0 || !stats.bestTimes || typeof stats.bestTimes !== 'object' ||
        Object.entries(stats.bestTimes).some(([id, time]) => !(isTrackId(id) || isCustomTrackRuntimeId(id)) || !Number.isFinite(time) || time <= 0 || time > storedTimeLimit(id))) throw new Error('Statistiques sauvegardées invalides.');
      for (const ranked of player.seasons) if (!/^\d{4}-Q[1-4]$/.test(ranked.season) || !integer(ranked.mmr, 0, 4000) || !integer(ranked.peakMmr, 0, 4000) ||
        !integer(ranked.races, 0, Number.MAX_SAFE_INTEGER) || !integer(ranked.wins, 0, ranked.races)) throw new Error('Saison sauvegardée invalide.');
    }
    for (const receipt of data.raceReceipts) if (!identifier(receipt.id) || !integer(receipt.at, 0, 8_640_000_000_000_000)) throw new Error('Reçu de course invalide.');
    for (const replay of data.replays) if (!identifier(replay.id) || !(isTrackId(replay.trackId) || isCustomTrackRuntimeId(replay.trackId)) || !integer(replay.trackRevision ?? 1, 1, 1000) || !integer(replay.createdAt, 0, 8_640_000_000_000_000) ||
      !integer(replay.durationMs, 0, storedTimeLimit(replay.trackId) * 1000) || typeof replay.ranked !== 'boolean' || !integer(replay.eventLevel ?? 0, 0, 3) || !Array.isArray(replay.drivers) || replay.drivers.length > 8 ||
      replay.drivers.some(driver => !identifier(driver.playerId) || name(driver.name) !== driver.name || !integer(driver.rank, 1, 8) ||
        typeof driver.finished !== 'boolean' || !Number.isFinite(driver.finishTime) || driver.finishTime < 0 || driver.finishTime > storedTimeLimit(replay.trackId))) throw new Error('Index des replays invalide.');
    return structuredClone(data);
  }
}
