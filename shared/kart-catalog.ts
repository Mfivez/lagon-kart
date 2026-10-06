/** Cosmetic library only: every chassis uses the same authoritative physics. */
export const KART_MODELS = [
  { id: 'zsky', name: 'Zsky', description: 'Carrosserie ouverte et phares ronds.',
    url: '/models/kart-zsky-v1.glb', author: 'Zsky', sourceUrl: 'https://poly.pizza/m/MkByxZCSMA' },
  { id: 'sprint', name: 'Sprint', description: 'Nez profilé, bande claire et fanion.',
    url: '/models/kart-sprint-v1.glb', author: 'Poly by Google', sourceUrl: 'https://poly.pizza/m/3hkutVs0AAV' },
  { id: 'retro', name: 'Rétro', description: 'Capot anguleux et grandes roues arrière.',
    url: '/models/kart-retro-v1.glb', author: 'Ben Harrison', sourceUrl: 'https://poly.pizza/m/bKDlM4mH7rg' },
] as const;

export type KartModelId = typeof KART_MODELS[number]['id'];
export const DEFAULT_KART_MODEL: KartModelId = 'zsky';
export function isKartModelId(value: unknown): value is KartModelId {
  return typeof value === 'string' && KART_MODELS.some(model => model.id === value);
}
export function normalizeKartModelId(value: unknown): KartModelId {
  return isKartModelId(value) ? value : DEFAULT_KART_MODEL;
}
export function getKartModel(value: unknown) {
  const id = normalizeKartModelId(value);
  return KART_MODELS.find(model => model.id === id)!;
}
