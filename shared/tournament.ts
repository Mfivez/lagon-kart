import { isTrackId, TRACK_IDS } from './track.js';

export type TournamentMode = 'single' | 'tournament';
export type TrackSelection = 'manual' | 'random';
export interface TournamentEntry {
  id: string; name: string; color: string; points: number; wins: number;
  team?: 0 | 1;
  totalTime: number; racesCompleted: number; rank: number;
}
export interface RoundEntry {
  id: string; name: string; rank: number; points: number; finished: boolean; finishTime: number;
}
export interface RoundResult { trackId: string; results: RoundEntry[] }
export interface TournamentState {
  mode: TournamentMode; selection: TrackSelection; trackPool: string[]; schedule: string[];
  raceCount: number; raceIndex: number; completed: boolean;
  standings: TournamentEntry[]; rounds: RoundResult[];
}
export interface TournamentDriver {
  id: string; name: string; color: string; spectator?: boolean;
  team?: 0 | 1;
  rank: number; finished: boolean; finishTime: number;
}
export const TOURNAMENT_POINTS = [15, 12, 10, 8, 6, 4, 2, 1] as const;

export function createTournament(trackId = 'lagon'): TournamentState {
  return { mode: 'single', selection: 'manual', trackPool: [trackId], schedule: [trackId],
    raceCount: 1, raceIndex: 0, completed: false, standings: [], rounds: [] };
}

/** The server supplies randomness. Never re-roll a schedule while racing. */
export function drawSchedule(pool: readonly string[], raceCount: number, random: () => number = Math.random): string[] {
  const schedule: string[] = [];
  while (schedule.length < raceCount) {
    const bag = [...pool];
    if (bag.length === 0) throw new Error('Choisissez au moins un circuit.');
    for (let index = bag.length - 1; index > 0; index--) {
      const other = Math.max(0, Math.min(index, Math.floor(random() * (index + 1))));
      [bag[index], bag[other]] = [bag[other]!, bag[index]!];
    }
    // Also avoid a duplicate across bags when another circuit is available.
    if (bag.length > 1 && bag[0] === schedule[schedule.length - 1]) [bag[0], bag[1]] = [bag[1]!, bag[0]!];
    schedule.push(...bag.slice(0, raceCount - schedule.length));
  }
  return schedule;
}

function tracks(value: unknown, field: string, maximum = 8): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximum || value.some(id => typeof id !== 'string' || !isTrackId(id))) {
    throw new Error(`${field} : choisissez entre un et ${maximum} circuits valides.`);
  }
  return [...value] as string[];
}

/** Returns a new state only after validating the entire configuration. */
export function applyConfiguration(current: TournamentState, payload: unknown, currentTrackId: string,
  random: () => number = Math.random): { tournament: TournamentState; trackId: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Réglages du salon invalides.');
  const options = payload as Record<string, unknown>;
  const allowed = ['mode', 'selection', 'trackId', 'trackPool', 'schedule', 'raceCount'];
  if (Object.keys(options).some(key => !allowed.includes(key))) throw new Error('Un réglage du salon est inconnu.');
  const mode = options.mode;
  const selection = options.selection;
  if (mode !== 'single' && mode !== 'tournament') throw new Error('Choisissez une course simple ou un tournoi.');
  if (selection !== 'manual' && selection !== 'random') throw new Error('Choisissez les circuits manuellement ou au hasard.');
  if (options.trackId !== undefined && (typeof options.trackId !== 'string' || !isTrackId(options.trackId))) {
    throw new Error('Ce circuit est inconnu.');
  }
  const pool = options.trackPool === undefined ? undefined : tracks(options.trackPool, 'Sélection de circuits', TRACK_IDS.length);
  const requestedSchedule = options.schedule === undefined ? undefined : tracks(options.schedule, 'Programme');
  if (pool && new Set(pool).size !== pool.length) throw new Error('La sélection aléatoire ne doit pas contenir de doublon.');
  if (mode === 'single') {
    if (options.raceCount !== undefined && options.raceCount !== 1) throw new Error('Une course simple contient une seule manche.');
    const trackId = options.trackId as string | undefined ?? currentTrackId;
    if (requestedSchedule && (requestedSchedule.length !== 1 || requestedSchedule[0] !== trackId)) throw new Error('Le programme doit correspondre au circuit choisi.');
    return { tournament: createTournament(trackId), trackId };
  }
  const count = options.raceCount ?? (current.mode === 'tournament' ? current.raceCount : 4);
  if (!Number.isInteger(count) || (count as number) < 2 || (count as number) > 8) {
    throw new Error('Un tournoi doit contenir entre deux et huit courses.');
  }
  const raceCount = count as number;
  let schedule: string[];
  let trackPool: string[];
  if (selection === 'manual') {
    schedule = requestedSchedule ?? (current.mode === 'tournament' && current.selection === 'manual'
      ? [...current.schedule] : Array.from({ length: raceCount }, () => options.trackId as string | undefined ?? currentTrackId));
    if (schedule.length !== raceCount) throw new Error('Le nombre de circuits du programme doit correspondre au nombre de courses.');
    trackPool = [...new Set(schedule)];
  } else {
    if (requestedSchedule) throw new Error('Le programme aléatoire est tiré par le serveur.');
    trackPool = pool ?? (current.mode === 'tournament' ? [...current.trackPool] : [currentTrackId]);
    const unchanged = current.mode === 'tournament' && current.selection === 'random' &&
      current.raceCount === raceCount && current.raceIndex === 0 && current.rounds.length === 0 &&
      current.trackPool.length === trackPool.length && trackPool.every(id => current.trackPool.includes(id));
    schedule = unchanged ? [...current.schedule] : drawSchedule(trackPool, raceCount, random);
  }
  return { trackId: schedule[0]!, tournament: { mode, selection, trackPool, schedule, raceCount,
    raceIndex: 0, completed: false, standings: [], rounds: [] } };
}

export function rankTournament(tournament: TournamentState): void {
  tournament.standings.sort((a, b) => b.points - a.points || b.wins - a.wins ||
    b.racesCompleted - a.racesCompleted || a.totalTime - b.totalTime || a.id.localeCompare(b.id));
  tournament.standings.forEach((entry, index) => { entry.rank = index + 1; });
}

export function registerTournamentDriver(tournament: TournamentState, driver: Pick<TournamentDriver, 'id' | 'name' | 'color' | 'team'>): void {
  // A guest arriving after the last race waits for rematch; final ranks stay frozen.
  if (tournament.mode !== 'tournament' || tournament.completed) return;
  const existing = tournament.standings.find(entry => entry.id === driver.id);
  if (existing) { existing.name = driver.name; existing.color = driver.color; if (driver.team === 0 || driver.team === 1) existing.team = driver.team; }
  else tournament.standings.push({ id: driver.id, name: driver.name, color: driver.color,
    ...(driver.team === 0 || driver.team === 1 ? { team: driver.team } : {}),
    points: 0, wins: 0, totalTime: 0, racesCompleted: 0, rank: 0 });
  rankTournament(tournament);
}

/** Idempotent: a round index can be scored exactly once, including disconnects. */
export function recordRound(tournament: TournamentState, trackId: string, drivers: readonly TournamentDriver[]): boolean {
  if (tournament.mode !== 'tournament' || tournament.completed || tournament.rounds.length !== tournament.raceIndex ||
    tournament.schedule[tournament.raceIndex] !== trackId) return false;
  const results: RoundEntry[] = [];
  const racers = drivers.filter(driver => !driver.spectator).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  for (const driver of racers) {
    registerTournamentDriver(tournament, driver);
    const finished = driver.finished && Number.isFinite(driver.finishTime) && driver.finishTime >= 0;
    const points = finished ? TOURNAMENT_POINTS[driver.rank - 1] ?? 0 : 0;
    const entry = tournament.standings.find(row => row.id === driver.id)!;
    entry.points += points;
    if (finished) {
      entry.wins += driver.rank === 1 ? 1 : 0;
      entry.totalTime += driver.finishTime;
      entry.racesCompleted += 1;
    }
    results.push({ id: driver.id, name: driver.name, rank: driver.rank, points, finished,
      finishTime: finished ? driver.finishTime : 0 });
  }
  tournament.rounds.push({ trackId, results });
  tournament.completed = tournament.rounds.length === tournament.raceCount;
  rankTournament(tournament);
  return true;
}

export function restartTournament(current: TournamentState, trackId: string, random: () => number = Math.random): TournamentState {
  if (current.mode === 'single') return createTournament(trackId);
  return { mode: 'tournament', selection: current.selection, trackPool: [...current.trackPool],
    schedule: current.selection === 'random' ? drawSchedule(current.trackPool, current.raceCount, random) : [...current.schedule],
    raceCount: current.raceCount, raceIndex: 0, completed: false, standings: [], rounds: [] };
}
