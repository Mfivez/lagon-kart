import type { Input } from './game.js';
import { autopilot, drivingRoute, type AutopilotDriver } from './autopilot.js';
import { getTrack } from './track.js';
import { getTrackEvent, nearestDriveableTrack } from './track-events.js';
import { getKartStats, type KartBuild } from './garage.js';
import { cpuRole, type CpuRole, type TeamId } from './teams.js';

/** Structural contract: CPU logic cannot access or mutate a room or player store. */
export interface CpuKart extends AutopilotDriver {
  id: string;
  boost?: number; stun?: number; lap?: number; progress?: number; team?: TeamId; role?: CpuRole;
  build?: KartBuild; connected?: boolean; finished?: boolean; spectator?: boolean; abandoned?: boolean;
  eventStage?: number; eventLevel?: number;
}
export interface CpuWorld { eventStage?: number; eventLevel?: number; teamMode?: boolean; players?: readonly CpuKart[] }
export type CpuDifficulty = number | 'easy' | 'normal' | 'hard';
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Ordinary bounded controls only: no bonus speed, teleports or skipped checkpoints. */
export function getCpuInput(kart: CpuKart, seq: number, world: CpuWorld = {}, difficulty: CpuDifficulty = 'normal'): Input {
  const skill = typeof difficulty === 'number' ? clamp(Number.isFinite(difficulty) ? difficulty : 0.6, 0, 1)
    : difficulty === 'easy' ? 0.3 : difficulty === 'hard' ? 1 : 0.65;
  const stage = world.eventStage ?? kart.eventStage ?? 0, level = world.eventLevel ?? kart.eventLevel ?? 0;
  const driving = autopilot({ ...kart, eventStage: stage, eventLevel: level }, seq);
  const track = getTrack(kart.trackId), stats = getKartStats(kart.build);
  const near = nearestDriveableTrack(kart.x, kart.z, track.id, stage, level, { progress: kart.routeProgress ?? kart.progress, elevation: kart.elevation });
  const ahead = drivingRoute(kart, near, stage, level).point(near.progress + 24);
  const curvature = Math.abs(angleDifference(ahead.angle, near.angle)) / 24;
  const onBranch = near.branchId !== '';
  const event = getTrackEvent(track.id, stage, level);
  const beforeDetour = event.blockers.length > 0 && event.branches.some(branch => branch.kind === 'detour' &&
    near.progress >= branch.start - 14 && near.progress <= branch.end + 8);
  const enemies = (world.players ?? []).filter(other => other.id !== kart.id && other.connected !== false && !other.finished && !other.spectator && !other.abandoned &&
    (!world.teamMode || kart.team === undefined || other.team !== kart.team));
  const nearby = enemies.some(other => Math.hypot(other.x - kart.x, other.z - kart.z) < 12);
  const forwardEnemy = enemies.some(other => {
    const dx = other.x - kart.x, dz = other.z - kart.z;
    const forward = dx * Math.sin(kart.angle) + dz * Math.cos(kart.angle), sideways = dx * Math.cos(kart.angle) - dz * Math.sin(kart.angle);
    return forward > 2 && forward < 45 && Math.abs(sideways) < 4;
  });
  const followingEnemy = enemies.some(other => {
    const dx = other.x - kart.x, dz = other.z - kart.z;
    const forward = dx * Math.sin(kart.angle) + dz * Math.cos(kart.angle);
    return forward < -2 && forward > -18 && Math.hypot(dx, dz) < 19;
  });
  const aheadInRace = enemies.some(other => (other.progress ?? 0) > (kart.progress ?? 0) + 0.1);
  const teamSeat = world.teamMode ? world.players?.filter(player => player.team === kart.team && !player.spectator).findIndex(player => player.id === kart.id) : undefined;
  const role = kart.role ?? cpuRole(teamSeat !== undefined && teamSeat >= 0 ? teamSeat
    : [...kart.id].reduce((sum, character) => sum + character.charCodeAt(0), 0));
  let use = false;
  if (kart.item === 'turbo' || kart.item === 'tripleTurbo') use = curvature < .03 && !onBranch && !beforeDetour && kart.speed > 8 && (kart.boost ?? 0) < .3;
  else if (kart.item === 'star') use = nearby || ((role === 'runner' || role === 'tactician') && curvature < .025 && kart.speed > 10);
  else if (kart.item === 'shield') use = nearby || (role === 'support' && beforeDetour);
  else if (kart.item === 'projectile') use = forwardEnemy;
  else if (kart.item === 'trap') use = followingEnemy;
  else if (kart.item === 'seeker' || kart.item === 'leaderBolt') use = aheadInRace;
  // Skill changes reaction timing, never engine power or checkpoint rules. A
  // beginner makes an item decision every 0.4 s; an expert reacts every tick.
  const decisionInterval = skill < .5 ? 12 : skill < .9 ? 3 : 1;
  return { ...driving, steer: clamp(driving.steer * 1.32 / stats.handling, -1, 1),
    use: use && Boolean(kart.item) && !kart.itemLatch && (kart.stun ?? 0) === 0 && seq % decisionInterval === 0 };
}
