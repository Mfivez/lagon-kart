export const GARAGE_SLOTS = ['chassis', 'engine', 'tires', 'turbo', 'wing', 'weight'] as const;
export type GarageSlot = typeof GARAGE_SLOTS[number];
export type KartBuild = Record<GarageSlot, string>;
export type KartStats = { speed: number; acceleration: number; handling: number; grip: number; stability: number; offroad: number; mud: number; turbo: number; mass: number };
export interface GaragePart { id: string; slot: GarageSlot; name: string; description: string; unlockLevel: number; modifiers: Partial<KartStats> }
export const SLOT_NAMES: Record<GarageSlot, string> = { chassis: 'Châssis', engine: 'Moteur', tires: 'Pneus', turbo: 'Turbo', wing: 'Aileron', weight: 'Poids' };
export const GARAGE_PARTS: readonly GaragePart[] = [
  { id: 'balanced', slot: 'chassis', name: 'Équilibré', description: 'Une base facile à prendre en main.', unlockLevel: 0, modifiers: {} },
  { id: 'light', slot: 'chassis', name: 'Plume', description: 'Accélère mieux, plus sensible aux chocs.', unlockLevel: 1, modifiers: { acceleration: 2, handling: .06, stability: -.08, mass: -.15 } },
  { id: 'heavy', slot: 'chassis', name: 'Costaud', description: 'Plus stable dans le trafic, moins vif.', unlockLevel: 2, modifiers: { acceleration: -2, stability: .12, mass: .2 } },
  { id: 'standard', slot: 'engine', name: 'Polyvalent', description: 'Équilibre entre vitesse et reprises.', unlockLevel: 0, modifiers: {} },
  { id: 'sprint', slot: 'engine', name: 'Sprint', description: 'Reprises rapides, vitesse de pointe réduite.', unlockLevel: 1, modifiers: { speed: -2, acceleration: 4 } },
  { id: 'velocity', slot: 'engine', name: 'Grand large', description: 'Plus rapide en ligne droite, repart moins vite.', unlockLevel: 2, modifiers: { speed: 3, acceleration: -3 } },
  { id: 'road', slot: 'tires', name: 'Route', description: 'Adhérence régulière sur l’asphalte.', unlockLevel: 0, modifiers: {} },
  { id: 'allterrain', slot: 'tires', name: 'Tout-terrain', description: 'Moins ralenti dans la boue et hors piste.', unlockLevel: 1, modifiers: { speed: -1, offroad: 5, mud: 5, grip: .03 } },
  { id: 'snow', slot: 'tires', name: 'Cloutés', description: 'Adhérence renforcée, au prix de la vitesse.', unlockLevel: 2, modifiers: { speed: -1.5, grip: .26, handling: -.04 } },
  { id: 'regular', slot: 'turbo', name: 'Régulier', description: 'Turbos faciles à contrôler.', unlockLevel: 0, modifiers: {} },
  { id: 'endurance', slot: 'turbo', name: 'Endurance', description: 'Mini-turbos plus longs, moins de pointe.', unlockLevel: 2, modifiers: { turbo: .2, speed: -.8 } },
  { id: 'burst', slot: 'turbo', name: 'Explosif', description: 'Très bonnes reprises, mini-turbos plus courts.', unlockLevel: 3, modifiers: { acceleration: 3, turbo: -.15, stability: -.05 } },
  { id: 'neutral', slot: 'wing', name: 'Neutre', description: 'Peu de résistance dans les lignes droites.', unlockLevel: 0, modifiers: {} },
  { id: 'downforce', slot: 'wing', name: 'Appui', description: 'Plus précis en virage, moins rapide.', unlockLevel: 2, modifiers: { handling: .12, stability: .1, speed: -1.5 } },
  { id: 'streamlined', slot: 'wing', name: 'Profilé', description: 'Gagne en vitesse, demande plus d’anticipation.', unlockLevel: 3, modifiers: { speed: 1.5, handling: -.06, stability: -.08 } },
  { id: 'normal', slot: 'weight', name: 'Standard', description: 'Répartition équilibrée.', unlockLevel: 0, modifiers: {} },
  { id: 'feather', slot: 'weight', name: 'Allégé', description: 'Vif au démarrage, plus exposé aux contacts.', unlockLevel: 1, modifiers: { acceleration: 2, mass: -.15, stability: -.05 } },
  { id: 'ballast', slot: 'weight', name: 'Lesté', description: 'Résiste aux contacts, accélère moins fort.', unlockLevel: 3, modifiers: { acceleration: -2, mass: .25, stability: .12 } },
];
export const DEFAULT_BUILD: Readonly<KartBuild> = Object.freeze({ chassis: 'balanced', engine: 'standard', tires: 'road', turbo: 'regular', wing: 'neutral', weight: 'normal' });
export function normalizeBuild(value: unknown, level = 0): KartBuild {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_BUILD };
  for (const slot of GARAGE_SLOTS) {
    const part = GARAGE_PARTS.find(part => part.slot === slot && part.id === input[slot]);
    if (part && part.unlockLevel <= Math.max(0, Math.min(3, level))) result[slot] = part.id;
  }
  return result;
}
const cache = new Map<string, Readonly<KartStats>>();
export function getKartStats(build: KartBuild = DEFAULT_BUILD): Readonly<KartStats> {
  const safe = normalizeBuild(build, 3);
  const key = GARAGE_SLOTS.map(slot => safe[slot]).join('/');
  const cached = cache.get(key);
  if (cached) return cached;
  const stats: KartStats = { speed: 32, acceleration: 22, handling: 1.32, grip: 1, stability: 1, offroad: 12, mud: 16, turbo: 1, mass: 1 };
  for (const slot of GARAGE_SLOTS) {
    const part = GARAGE_PARTS.find(part => part.slot === slot && part.id === safe[slot])!;
    for (const [name, amount] of Object.entries(part.modifiers)) stats[name as keyof KartStats] += amount;
  }
  const result = Object.freeze(stats);
  cache.set(key, result);
  return result;
}
