import { getTrack, nearestTrack, trackElevation, trackPoint, type Surface, type TrackInteraction, type TrackZone } from './track.js';

export const INTERACTION_WARNING_SECONDS = 1;
export const INTERACTION_COOLDOWN_SECONDS = 2;
export interface TrackInteractionState { id:string; triggeredAt:number; activeAt:number; expiresAt:number; triggeredBy:string }
interface InteractionKart { routeProgress?:number;progress?:number;id:string;x:number;z:number;elevation:number;speed:number;airborne:boolean;connected:boolean;spectator:boolean;abandoned:boolean;finished:boolean;trackId:string }
interface InteractionWorld {trackId:string;time:number;interactions?:TrackInteractionState[]}

/** Snapshot state is explicit: different rooms using one definition stay independent. */
export function activeTrackInteractions(trackId:string,states:readonly TrackInteractionState[]|undefined,time:number):TrackInteraction[] {
  if (!states?.length) return [];
  return (getTrack(trackId).interactions??[]).filter(module=>states.some(state=>state.id===module.id&&time>=state.activeAt&&time<state.expiresAt));
}
export function resetTrackInteractions(world:InteractionWorld):void {
  if (getTrack(world.trackId).interactions?.length) world.interactions=[];
  else delete world.interactions;
}
/** Trigger once on a forward, grounded crossing. Parking, reversing, airborne
 * crossings, resets and contacts with another deck cannot spam the plate. */
export function triggerTrackInteractions(world:InteractionWorld,kart:InteractionKart,previousX:number,previousZ:number):boolean {
  const modules=getTrack(world.trackId).interactions;
  if (!modules?.length||kart.trackId!==world.trackId||!kart.connected||kart.spectator||kart.abandoned||kart.finished||kart.airborne||kart.speed<2||
    Math.hypot(kart.x-previousX,kart.z-previousZ)>20) return false;
  let triggered=false;
  for (const module of modules) {
    const prior=world.interactions?.find(state=>state.id===module.id);
    if (prior&&world.time<prior.expiresAt+INTERACTION_COOLDOWN_SECONDS) continue;
    const gate=trackPoint(module.trigger,world.trackId),sine=Math.sin(gate.angle),cosine=Math.cos(gate.angle);
    const from=(previousX-gate.x)*sine+(previousZ-gate.z)*cosine,to=(kart.x-gate.x)*sine+(kart.z-gate.z)*cosine;
    if (from>=0||to<0||to-from<1e-8) continue;
    const fraction=-from/(to-from),x=previousX+(kart.x-previousX)*fraction,z=previousZ+(kart.z-previousZ)*fraction;
    const across=(x-gate.x)*cosine-(z-gate.z)*sine;
    if (Math.abs(across-module.offset)>module.width/2+.35||Math.abs(kart.elevation-trackElevation(module.trigger,world.trackId))>1) continue;
    // On a self crossing, physical location alone is ambiguous. Match the
    // nearest route segment as well, without awarding any lap progress.
    const near=nearestTrack(kart.x,kart.z,world.trackId,{progress:kart.routeProgress??kart.progress,elevation:kart.elevation}),length=getTrack(world.trackId).length;
    if (Math.min(Math.abs(near.progress-module.trigger),length-Math.abs(near.progress-module.trigger))>20) continue;
    const state={id:module.id,triggeredAt:world.time,activeAt:world.time+INTERACTION_WARNING_SECONDS,expiresAt:world.time+INTERACTION_WARNING_SECONDS+module.duration,triggeredBy:kart.id};
    world.interactions=[...(world.interactions??[]).filter(item=>item.id!==module.id),state]; triggered=true;
  }
  return triggered;
}

export function interactionZones(trackId:string,states:readonly TrackInteractionState[]|undefined,time:number):TrackZone[] {
  return activeTrackInteractions(trackId,states,time).filter(module=>module.kind==='boost').map(module=>({id:module.id,kind:'boost',start:module.start,end:module.end,offset:module.offset,width:module.width}));
}
export function applyInteractionSurface(contact:{surface:Surface;zone?:TrackZone},near:{x:number;z:number;progress:number;angle:number;branchId?:string},
  x:number,z:number,trackId:string,states:readonly TrackInteractionState[]|undefined,time:number):{surface:Surface;zone?:TrackZone} {
  if (contact.surface==='offroad'||near.branchId) return contact;
  const across=(x-near.x)*Math.cos(near.angle)-(z-near.z)*Math.sin(near.angle);
  const zone=interactionZones(trackId,states,time).find(zone=>near.progress>=zone.start&&near.progress<=zone.end&&Math.abs(across-zone.offset)<=zone.width/2);
  return zone?{surface:'boost',zone}:contact;
}
/** The ramp's launchSpeed=0 is the permanent fallback. Only its existing
 * impulse is replaced; road height, walls, checkpoints and bots never move. */
export function interactionLaunchSpeed(rampId:string,trackId:string,states:readonly TrackInteractionState[]|undefined,time:number):number|undefined {
  return activeTrackInteractions(trackId,states,time).find(module=>module.kind==='jump'&&module.elevationId===rampId)?.launchSpeed;
}
export function interactionStatus(module:TrackInteraction,states:readonly TrackInteractionState[]|undefined,time:number):'ready'|'warning'|'active'|'cooldown' {
  const state=states?.find(state=>state.id===module.id);
  if (!state||time>=state.expiresAt+INTERACTION_COOLDOWN_SECONDS) return 'ready';
  return time<state.activeAt?'warning':time<state.expiresAt?'active':'cooldown';
}
export function trackInteractionNotice(trackId:string,states:readonly TrackInteractionState[]|undefined,time:number):{title:string;description:string;remaining:number}|undefined {
  const recent=[...(states??[])].filter(state=>time<state.expiresAt).sort((a,b)=>b.triggeredAt-a.triggeredAt)[0];
  const module=getTrack(trackId).interactions?.find(module=>module.id===recent?.id); if (!recent||!module) return;
  const warning=time<recent.activeAt,remaining=Math.max(0,Math.ceil((warning?recent.activeAt:recent.expiresAt)-time));
  const name=module.kind==='boost'?'Turbo partagé':'Tremplin renforcé';
  return {title:`${name} ${warning?'dans':'actif ·'} ${remaining} s`,description:warning?'Une plaque a été franchie. La cible colorée va s’activer pour tous.':'Profitez de la cible colorée. La route garde sa forme à la fin de l’effet.',remaining};
}
