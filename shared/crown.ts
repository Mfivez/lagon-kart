import type { Kart, World } from './game.js';

export const CROWN_SECONDS = 90;
export const CROWN_PROTECTION_SECONDS = 3;
export interface CrownState {
  duration: number; remaining: number; holderId: string; protectedUntil: number;
  scores: Record<string, number>; meters: Record<string, number>; creditedProgress: Record<string, number>; transfers: number;
  lastTransfer?: { seq: number; at: number; fromId: string; toId: string };
}
type Prior = { progress: number; x: number; z: number; resetCooldown: number };
const previous = new WeakMap<World, { holderId: string; players: Map<string, Prior> }>();
const eligible = (kart: Kart) => kart.connected && !kart.spectator && !kart.abandoned;
export function createCrownState(): CrownState {
  return { duration: CROWN_SECONDS, remaining: CROWN_SECONDS, holderId: '', protectedUntil: 0, scores: {}, meters: {}, creditedProgress: {}, transfers: 0 };
}
function assign(world: World, id: string, attack = false) {
  const crown = world.crown!; const fromId = crown.holderId;
  crown.holderId = id; crown.protectedUntil = world.raceTime + CROWN_PROTECTION_SECONDS;
  if (attack) { crown.transfers++; crown.lastTransfer = { seq: crown.transfers, at: world.raceTime, fromId, toId: id }; }
}
export function startCrown(world: World): void {
  if (!world.crown) return;
  world.crown = createCrownState();
  for (const kart of world.players) { kart.crownMode = true; world.crown.scores[kart.id] = 0; world.crown.meters[kart.id] = 0; world.crown.creditedProgress[kart.id] = kart.progress; }
  assign(world, world.players.filter(eligible).sort((a, b) => b.progress - a.progress || a.id.localeCompare(b.id))[0]?.id ?? '');
  beforeCrownStep(world);
}
export function crownProtected(world: World, id: string): boolean {
  return !!world.crown && world.crown.holderId === id && world.raceTime < world.crown.protectedUntil;
}
/** Called only after the ordinary shield/star/grace checks accepted a real hit. */
export function onCrownAttack(world: World, attackerId: string, victimId: string): boolean {
  const crown = world.crown;
  if (!crown || world.phase !== 'racing' || victimId !== crown.holderId || attackerId === victimId || crownProtected(world, victimId)) return false;
  const attacker = world.players.find(kart => kart.id === attackerId);
  if (!attacker || !eligible(attacker)) return false;
  assign(world, attacker.id, true); return true;
}
export function beforeCrownStep(world: World): void {
  if (!world.crown) return;
  previous.set(world, { holderId: world.crown.holderId, players: new Map(world.players.map(kart => [kart.id, { progress: kart.progress, x: kart.x, z: kart.z, resetCooldown: kart.resetCooldown }])) });
}
/** Scores validated forward route progress, never parked time, reverse or respawn. */
export function stepCrown(world: World, dt: number): void {
  const crown = world.crown; if (!crown || world.phase !== 'racing') return;
  const active = world.players.filter(eligible);
  if (!active.some(kart => kart.id === crown.holderId)) assign(world, [...active].sort((a, b) => b.progress - a.progress || a.id.localeCompare(b.id))[0]?.id ?? '');
  const prior = previous.get(world);
  const holder = active.find(kart => kart.id === prior?.holderId), old = holder && prior?.players.get(holder.id);
  if (holder && old) {
    const delta = holder.progress - old.progress;
    const maximum = Math.max(1, Math.abs(holder.speed)) * Math.min(.1, Math.max(0, dt)) * 1.8 + .3;
    if (holder.speed > 1 && holder.resetCooldown <= 0 && old.resetCooldown <= 0 && delta > 0 && delta <= maximum && Math.hypot(holder.x - old.x, holder.z - old.z) <= maximum + .5) {
      const fresh = Math.max(0, holder.progress - Math.max(old.progress, crown.creditedProgress[holder.id] ?? old.progress));
      crown.meters[holder.id] = (crown.meters[holder.id] ?? 0) + fresh;
      crown.creditedProgress[holder.id] = Math.max(crown.creditedProgress[holder.id] ?? -Infinity, holder.progress);
      crown.scores[holder.id] = Math.floor(crown.meters[holder.id]! / 4);
    }
  }
  crown.remaining = Math.max(0, CROWN_SECONDS - world.raceTime);
  const ended = crown.remaining <= 1e-8;
  const ordered = world.players.filter(kart => !kart.spectator).sort((a, b) => (ended ? Number(eligible(b)) - Number(eligible(a)) : 0) || (crown.scores[b.id] ?? 0) - (crown.scores[a.id] ?? 0) || b.progress - a.progress || a.id.localeCompare(b.id));
  ordered.forEach((kart, index) => { kart.rank = index + 1; });
  if (ended) {
    crown.remaining = 0; world.phase = 'finished'; world.finishTimeout = 0;
    for (const kart of ordered) { kart.speed = 0; kart.finished = !kart.abandoned && kart.connected; kart.finishTime = kart.finished ? world.raceTime : 0; }
  }
}
