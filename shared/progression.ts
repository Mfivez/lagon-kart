/** Public career/ranked/replay contracts. No identity secret belongs in these types. */
export type CareerLevel = 0 | 1 | 2 | 3;
export type RankedTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master';
export interface Championship {
  id: string; name: string; description: string; tracks: readonly string[];
  unlockLevel: CareerLevel; rewardLevel: CareerLevel; introduction: readonly string[]; xp: number;
}
export const CHAMPIONSHIPS: readonly Championship[] = [
  { id: 'discovery', name: 'Premiers virages', description: 'Deux courses pour apprendre la trajectoire et le drift.',
    tracks: ['lagon', 'lagon'], unlockLevel: 0, rewardLevel: 1, introduction: ['Drift', 'Objets', 'Bandes turbo'], xp: 150 },
  { id: 'terrain', name: 'Les explorateurs', description: 'Choisissez vos pneus et découvrez plusieurs terrains.',
    tracks: ['lagon', 'canyon'], unlockLevel: 1, rewardLevel: 1, introduction: ['Boue', 'Routes alternatives', 'Choix des pneus'], xp: 180 },
  { id: 'weather', name: 'La traversée', description: 'Apprenez à anticiper les surfaces et les changements de météo.',
    tracks: ['canyon', 'glacier', 'mangrove'], unlockLevel: 1, rewardLevel: 2, introduction: ['Glace', 'Inondation', 'Météo'], xp: 240 },
  { id: 'precision', name: 'Au millimètre', description: 'Le drift et les raccourcis demandent de la précision.',
    tracks: ['neon', 'dunes', 'harbor'], unlockLevel: 2, rewardLevel: 2, introduction: ['Raccourcis', 'Ponts et sauts', 'Stabilité'], xp: 280 },
  { id: 'metamorphosis', name: 'Rien ne reste en place', description: 'Adaptez votre route à chaque tour.',
    tracks: ['forest', 'volcan', 'foundry', 'castle'], unlockLevel: 2, rewardLevel: 3,
    introduction: ['Transformations', 'Routes selon le tour', 'Événements combinés'], xp: 360 },
  { id: 'masters', name: 'La grande tournée', description: 'Huit courses combinent les terrains, les sauts et les transformations.',
    tracks: ['neon', 'glacier', 'mangrove', 'dunes', 'volcan', 'sky', 'foundry', 'castle'], unlockLevel: 3, rewardLevel: 3,
    introduction: ['Toutes les mécaniques', 'Anticipation', 'Adaptation du kart'], xp: 500 },
] as const;

export function championshipById(id: string): Championship | undefined { return CHAMPIONSHIPS.find(cup => cup.id === id); }
export function careerLevel(completedChampionships: readonly string[]): CareerLevel {
  return CHAMPIONSHIPS.reduce<CareerLevel>((level, cup) => completedChampionships.includes(cup.id)
    ? Math.max(level, cup.rewardLevel) as CareerLevel : level, 0);
}
export const RANK_THRESHOLDS: readonly { name: RankedTier; minimum: number }[] = [
  { name: 'Bronze', minimum: 0 }, { name: 'Silver', minimum: 900 }, { name: 'Gold', minimum: 1100 },
  { name: 'Platinum', minimum: 1350 }, { name: 'Diamond', minimum: 1650 }, { name: 'Master', minimum: 1950 },
];
export const INITIAL_MMR = 800;
export function rankForMmr(mmr: number): RankedTier {
  return [...RANK_THRESHOLDS].reverse().find(rank => Number.isFinite(mmr) && mmr >= rank.minimum)?.name ?? 'Bronze';
}
export function seasonId(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
export interface PlayerStats {
  races: number; finishes: number; wins: number; podiums: number; totalRaceTime: number;
  bestTimes: Record<string, number>;
}
export interface SeasonStats { season: string; mmr: number; races: number; wins: number; peakMmr: number }
export interface PlayerProfile {
  id: string; name: string; createdAt: number; xp: number; careerLevel: CareerLevel;
  completedChampionships: string[]; stats: PlayerStats;
  season: string; mmr: number; rank: RankedTier; ranked: SeasonStats;
}
export interface LeaderboardEntry {
  position: number; playerId: string; name: string; mmr: number; rank: RankedTier; races: number; wins: number;
}
/** Quantised [milliseconds, centimetres X, centimetres Z, milliradians, cm/s, lap, effect flags]. */
export type ReplayFrame = [number, number, number, number, number, number, number];
export interface ReplayDriver {
  playerId: string; name: string; color: string; rank: number; finished: boolean; finishTime: number;
  frames: ReplayFrame[];
}
export interface ReplayData {
  version: 1; id: string; trackId: string; createdAt: number; durationMs: number;
  /** Missing on recordings made before the October circuit redesign. */
  trackRevision?: number;
  season: string; ranked: boolean; eventLevel?: number; drivers: ReplayDriver[];
}
export interface ReplaySummary {
  id: string; trackId: string; createdAt: number; durationMs: number; ranked: boolean; eventLevel?: number;
  trackRevision?: number;
  drivers: { playerId: string; name: string; finishTime: number; finished: boolean; rank: number }[];
}
export interface GhostData {
  version: 1; replayId: string; trackId: string; playerId: string; name: string; color: string;
  trackRevision?: number;
  finishTime: number; eventLevel?: number; frames: ReplayFrame[];
}
