/** Public presence carries only the pilot's public identity and current activity. */
export type PresenceStatus = 'home' | 'ranked-search' | 'ranked-ready' | 'lobby' | 'racing'
  | 'ranked-race' | 'practice' | 'spectating' | 'results';
export interface OnlinePlayer { id: string; name: string; status: PresenceStatus }
export interface PresenceSnapshot { players: OnlinePlayer[]; connected: number; searchingRanked: number }
export const PRESENCE_INTERVAL_MS = 12_000;
export const PRESENCE_EXPIRY_MS = 45_000;
