/** Original cartoon caricatures; selection has no effect on driving statistics. */
export const CHARACTERS = [
  { id: 'racer', name: 'Pilote', description: 'Casque intégral et combinaison aux couleurs de ton kart.' },
  { id: 'queen', name: 'La Reine', description: 'Caricature royale : couronne, perles et salut majestueux.' },
  { id: 'obama', name: 'Obama', description: 'Caricature en costume, sourire confiant et mini-pupitre.' },
  { id: 'trump', name: 'Trump', description: 'Caricature à la mèche dorée et cravate démesurée.' },
  { id: 'kim', name: 'Kim Jong-un', description: 'Caricature à la coupe haute et au siège de commandant.' },
] as const;
export type CharacterId = typeof CHARACTERS[number]['id'];
export const DEFAULT_CHARACTER: CharacterId = 'racer';
export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTERS.some(character => character.id === value);
}
export function normalizeCharacterId(value: unknown): CharacterId {
  return isCharacterId(value) ? value : DEFAULT_CHARACTER;
}
