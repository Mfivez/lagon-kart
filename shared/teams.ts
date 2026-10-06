import { TOURNAMENT_POINTS } from './tournament.js';

export type TeamId = 0 | 1;
export const TEAMS = [
  { id: 0 as const, name: 'Corail', color: '#ff8c77' },
  { id: 1 as const, name: 'Lagon', color: '#65c9ff' },
] as const;
export const CPU_ROLES = [
  { id: 'runner', name: 'Éclaireur', description: 'Cherche une bonne place et utilise ses accélérations dans les lignes droites.' },
  { id: 'support', name: 'Soutien', description: 'Conserve une protection pour les zones où les adversaires sont proches.' },
  { id: 'defender', name: 'Protecteur', description: 'Pose des balises lorsque des adversaires suivent son équipe.' },
  { id: 'tactician', name: 'Stratège', description: 'Attend un adversaire devant avant de lancer un objet guidé.' },
] as const;
export type CpuRole = typeof CPU_ROLES[number]['id'];
export function cpuRole(index: number): CpuRole { return CPU_ROLES[((Math.floor(index) % 4) + 4) % 4]!.id; }

export interface TeamMember { id: string; team?: TeamId; spectator?: boolean; abandoned?: boolean }
/** Call before adding a new driver; explicit existing assignments remain stable. */
export function assignTeam(players: readonly TeamMember[], index = players.length): TeamId {
  const counts = [0, 0];
  for (const player of players) if (!player.spectator && !player.abandoned && (player.team === 0 || player.team === 1)) counts[player.team]!++;
  if (counts[0]! >= 4 && counts[1]! >= 4) throw new Error('Les deux équipes sont complètes.');
  if (counts[0]! >= 4) return 1;
  if (counts[1]! >= 4) return 0;
  return counts[0] === counts[1] ? Math.abs(Math.floor(index)) % 2 as TeamId : counts[0]! < counts[1]! ? 0 : 1;
}

export interface TeamScoreEntry { id: string; points: number; wins?: number; racesCompleted?: number; totalTime?: number }
export interface TeamStanding {
  team: TeamId; name: string; color: string; points: number; wins: number; finishers: number; totalTime: number; rank: 1 | 2;
}
type Assignments = ReadonlyMap<string, TeamId> | Readonly<Record<string, TeamId>>;
function teamOf(assignments: Assignments, id: string): TeamId | undefined {
  return typeof (assignments as ReadonlyMap<string, TeamId>).get === 'function'
    ? (assignments as ReadonlyMap<string, TeamId>).get(id) : (assignments as Readonly<Record<string, TeamId>>)[id];
}
const compare = (a: TeamStanding, b: TeamStanding) => b.points - a.points || b.wins - a.wins || b.finishers - a.finishers || a.totalTime - b.totalTime;
export function teamStandings(standings: readonly TeamScoreEntry[], assignments: Assignments): TeamStanding[] {
  const teams: TeamStanding[] = TEAMS.map(team => ({ team: team.id, name: team.name, color: team.color,
    points: 0, wins: 0, finishers: 0, totalTime: 0, rank: 1 }));
  const seen = new Set<string>();
  for (const entry of standings) {
    const team = teamOf(assignments, entry.id);
    if ((team !== 0 && team !== 1) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const target = teams[team]!;
    target.points += Number.isFinite(entry.points) ? Math.max(0, entry.points) : 0;
    target.wins += Number.isFinite(entry.wins) ? Math.max(0, entry.wins!) : 0;
    target.finishers += Number.isFinite(entry.racesCompleted) ? Math.max(0, entry.racesCompleted!) : 0;
    target.totalTime += Number.isFinite(entry.totalTime) ? Math.max(0, entry.totalTime!) : 0;
  }
  teams.sort((a, b) => compare(a, b) || a.team - b.team);
  teams[1]!.rank = compare(teams[0]!, teams[1]!) === 0 ? 1 : 2;
  return teams;
}

export interface TeamRoundDriver extends TeamMember { rank: number; finished: boolean; finishTime: number }
export function teamScoreRound(drivers: readonly TeamRoundDriver[]): TeamStanding[] {
  const racers = drivers.filter(driver => !driver.spectator);
  const assignments = new Map(racers.filter(driver => driver.team === 0 || driver.team === 1).map(driver => [driver.id, driver.team!]));
  return teamStandings(racers.map(driver => {
    const finished = driver.finished && Number.isFinite(driver.finishTime) && driver.finishTime > 0;
    return { id: driver.id, points: finished ? TOURNAMENT_POINTS[driver.rank - 1] ?? 0 : 0,
      wins: Number(finished && driver.rank === 1), racesCompleted: Number(finished), totalTime: finished ? driver.finishTime : 0 };
  }), assignments);
}
