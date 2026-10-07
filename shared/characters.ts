/** Original cartoon caricatures; selection has no effect on driving statistics. */
export const CHARACTERS = [
  { id: 'racer', name: 'Pilote', description: 'Casque intégral et combinaison aux couleurs de ton kart.' },
  { id: 'queen', name: 'La Reine', description: 'Caricature royale : couronne, perles et salut majestueux.' },
  { id: 'obama', name: 'Obama', description: 'Caricature en costume, sourire confiant et mini-pupitre.' },
  { id: 'trump', name: 'Trump', description: 'Caricature à la mèche dorée et cravate démesurée.' },
  { id: 'kim', name: 'Kim Jong-un', description: 'Caricature à la coupe haute et au siège de commandant.' },
  { id: 'macron', name: 'Macron', description: 'Costume impeccable, sourcil levé : son programme tient dans un virage.' },
  { id: 'merkel', name: 'Angela Merkel', description: 'Carré blond, veste framboise et calme olympien, même dans les dérapages.' },
  { id: 'napoleon', name: 'Napoléon', description: 'Un bicorne XXL pour un stratège qui voit chaque raccourci comme une conquête.' },
  { id: 'plumber', name: 'Le Plombier turbo', description: 'Casquette rouge, grosse moustache : venu réparer les tuyaux, reparti avec la coupe.' },
  { id: 'elf', name: 'Le Lutin vert', description: 'Bonnet pointu et bouclier dans le dos : sa quête secondaire, c’est le podium.' },
  { id: 'hedgehog', name: 'Le Hérisson pressé', description: 'Piquants bleus et gants blancs : découvre enfin pourquoi les karts ont des freins.' },
  { id: 'block', name: 'Le Mineur cubique', description: 'Tout en cubes, sauf ses trajectoires. Sa pioche ne creuse aucun raccourci.' },
  { id: 'chemist', name: 'Le Prof de chimie', description: 'Chapeau, lunettes et combinaison jaune : il prépare une formule pour le turbo.' },
  { id: 'space', name: 'Le Seigneur du casque', description: 'Casque noir, cape et tableau lumineux : le côté obscur du créneau.' },
] as const;
export type CharacterId = typeof CHARACTERS[number]['id'];
export const DEFAULT_CHARACTER: CharacterId = 'racer';
export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && CHARACTERS.some(character => character.id === value);
}
export function normalizeCharacterId(value: unknown): CharacterId {
  return isCharacterId(value) ? value : DEFAULT_CHARACTER;
}
