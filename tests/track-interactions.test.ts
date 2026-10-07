import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CUSTOM_TRACK_TEMPLATES,compileCustomTrack,getTrackWorkshopStart,registerCustomTrack,validateCustomTrackDraft,type StoredCustomTrack} from '../shared/custom-tracks.js';
import {trackElevation,trackPoint} from '../shared/track.js';
import {activeTrackInteractions,applyInteractionSurface,interactionLaunchSpeed,interactionStatus,resetTrackInteractions,trackInteractionNotice,triggerTrackInteractions} from '../shared/track-interactions.js';
import {COLORS,createKart,createWorld,neutralInput,startRace,stepKart,stepWorld} from '../shared/game.js';
import {nearestDriveableTrack} from '../shared/track-events.js';
import {autopilot} from '../shared/autopilot.js';
import {CustomTrackStore} from '../server/custom-track-store.js';

function source(name:string):StoredCustomTrack {
  const draft=structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft); draft.zones=[];
  draft.interactions=[{kind:'boost',trigger:.12,start:.19,end:.23,duration:8,width:8,offset:0},
    {kind:'jump',trigger:.35,start:.42,end:.445,duration:9,width:10,offset:0,height:2,launchSpeed:9}];
  return {id:`custom-interaction-${name}`,revision:1,draft,createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z'};
}
function crossing(trackId:string,trigger:number) {
  const kart=createKart('driver','Pilote',COLORS[0]!,0,trackId),gate=trackPoint(trigger,trackId);
  Object.assign(kart,{x:gate.x+Math.sin(gate.angle),z:gate.z+Math.cos(gate.angle),angle:gate.angle,speed:20,elevation:trackElevation(trigger,trackId)});
  return {kart,previousX:gate.x-Math.sin(gate.angle),previousZ:gate.z-Math.cos(gate.angle)};
}

test('interaction source validates, persists and compiles permanent ramp with no historical default keys',async()=>{
  const record=source('persist'),before=structuredClone(record),track=compileCustomTrack(record);
  assert.deepEqual(record,before);assert.equal(track.interactions?.length,2);assert.equal(track.elevations.length,1);
  assert.equal(track.elevations[0]!.launchSpeed,0);assert.equal(track.interactions![1]!.elevationId,track.elevations[0]!.id);
  assert.equal('interactions' in validateCustomTrackDraft(CUSTOM_TRACK_TEMPLATES[0]!.draft).draft!,false);
  for(const delta of [{duration:Infinity},{duration:2},{trigger:1},{width:100},{kind:'barrier'},{start:.3,end:.2}]) {
    const draft=structuredClone(record.draft);Object.assign(draft.interactions![0]!,delta);assert.equal(validateCustomTrackDraft(draft).ok,false);
  }
  const directory=await mkdtemp(join(tmpdir(),'lagon-interactions-'));
  try {const store=await CustomTrackStore.open(directory),saved=await store.save({id:'author',name:'Atelier'},record.draft);
    const reopened=await CustomTrackStore.open(directory);assert.deepEqual(reopened.get(saved.runtimeId)!.draft.interactions,record.draft.interactions);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('swept switch announces, affects every player, expires and cannot be extended by camping',()=>{
  const track=registerCustomTrack(source('timing')),module=track.interactions![0]!,world=createWorld(false,track.id),pass=crossing(track.id,module.trigger);world.time=10;
  assert.equal(triggerTrackInteractions(world,pass.kart,pass.previousX,pass.previousZ),true);
  assert.equal(interactionStatus(module,world.interactions,10),'warning');assert.equal(activeTrackInteractions(track.id,world.interactions,10).length,0);
  assert.match(trackInteractionNotice(track.id,world.interactions,10)!.title,/dans 1 s/);
  const state=structuredClone(world.interactions);world.time=13;
  assert.equal(triggerTrackInteractions(world,pass.kart,pass.previousX,pass.previousZ),false);assert.deepEqual(world.interactions,state);
  assert.equal(interactionStatus(module,world.interactions,11),'active');assert.equal(interactionStatus(module,world.interactions,19),'cooldown');
  const point=trackPoint((module.start+module.end)/2,track.id),near=nearestDriveableTrack(point.x,point.z,track.id);
  const a=applyInteractionSurface({surface:'road'},near,point.x,point.z,track.id,world.interactions,12);
  const b=applyInteractionSurface({surface:'road'},near,point.x,point.z,track.id,JSON.parse(JSON.stringify(world.interactions)),12);
  assert.equal(a.surface,'boost');assert.deepEqual(a,b);assert.equal(applyInteractionSurface({surface:'road'},near,point.x,point.z,track.id,world.interactions,19).surface,'road');
  assert.equal(applyInteractionSurface({surface:'road'},near,point.x+Math.cos(point.angle)*7,point.z-Math.sin(point.angle)*7,track.id,world.interactions,12).surface,'road');
  world.time=21;assert.equal(triggerTrackInteractions(world,pass.kart,pass.previousX,pass.previousZ),true);
  const other=createWorld(false,track.id);assert.equal(other.interactions,undefined,'rooms do not share runtime state');
  resetTrackInteractions(world);assert.deepEqual(world.interactions,[]);
});

test('switch ignores reverse, airborne, wrong height, disconnected drivers and reset-sized teleports',()=>{
  const track=registerCustomTrack(source('guards')),module=track.interactions![0]!;
  for(const change of [{airborne:true},{elevation:10},{connected:false},{spectator:true},{abandoned:true},{speed:-5}]) {
    const pass=crossing(track.id,module.trigger);Object.assign(pass.kart,change);
    assert.equal(triggerTrackInteractions(createWorld(false,track.id),pass.kart,pass.previousX,pass.previousZ),false);
  }
  const pass=crossing(track.id,module.trigger),world=createWorld(false,track.id);
  assert.equal(triggerTrackInteractions(world,pass.kart,pass.previousX-50,pass.previousZ-50),false);
  const x=pass.kart.x,z=pass.kart.z;pass.kart.x=pass.previousX;pass.kart.z=pass.previousZ;
  assert.equal(triggerTrackInteractions(world,pass.kart,x,z),false);
});

test('active ramp changes real launch impulse while route geometry and expired landing stay fixed',()=>{
  const track=registerCustomTrack(source('jump')),module=track.interactions![1]!,world=createWorld(false,track.id),pass=crossing(track.id,module.trigger);world.time=1;
  triggerTrackInteractions(world,pass.kart,pass.previousX,pass.previousZ);
  const heights=Array.from({length:11},(_,index)=>trackElevation(module.start+(module.end-module.start)*index/10,track.id));
  assert.equal(interactionLaunchSpeed(module.elevationId!,track.id,world.interactions,3),9);assert.equal(interactionLaunchSpeed(module.elevationId!,track.id,world.interactions,20),undefined);
  const run=(active:boolean)=>{const kart=createKart(active?'on':'off','Pilote',COLORS[0]!,0,track.id),point=trackPoint(module.end-.1,track.id);
    Object.assign(kart,{...point,speed:20,elevation:trackElevation(module.end-.1,track.id),interactionTime:3,interactions:active?world.interactions:[]});
    stepKart(kart,{...neutralInput(),throttle:1},1/30);return kart;};
  const on=run(true),off=run(false);assert.equal(on.airborne,true);assert.ok(on.verticalVelocity>8);assert.ok(off.verticalVelocity<0);
  assert.deepEqual(Array.from({length:11},(_,index)=>trackElevation(module.start+(module.end-module.start)*index/10,track.id)),heights);
});

test('workshop selection derives approach and event phase and rejects fabricated indexes',()=>{
  const record=source('workshop');record.draft.lapCount=6;record.draft.events=[{lap:5,kind:'ice',start:.7,end:.75}];
  record.draft.elevations=[{kind:'bridge',start:.03,end:.08,height:4,approach:15}];
  const track=registerCustomTrack(record),selection=getTrackWorkshopStart(track.id,{group:'interactions',index:0})!;
  assert.ok(Math.abs(selection.progress-(track.interactions![0]!.trigger-35))<1e-6);assert.equal(selection.end,track.interactions![0]!.end);
  assert.equal(getTrackWorkshopStart(track.id,{group:'events',index:0})!.eventStage,4);
  assert.equal(getTrackWorkshopStart(track.id,{group:'elevations',index:1}),undefined,'auto ramps do not shift authored indexes');
  for(const invalid of [null,{group:'interactions',index:-1},{group:'interactions',index:Infinity},{group:'constructor',index:0},{group:'interactions',index:99}])assert.equal(getTrackWorkshopStart(track.id,invalid),undefined);
  assert.equal(getTrackWorkshopStart('lagon',{group:'zones',index:0}),undefined);
});

test('ordinary CPU inputs finish a full race through interactive turbo and jump without invalid values',()=>{
  const track=registerCustomTrack(source('race')),world=createWorld(false,track.id);world.players=Array.from({length:4},(_,index)=>createKart(`bot-${index}`,`CPU${index}`,COLORS[index]!,index,track.id));
  startRace(world);let triggered=false,boost=false,jump=false;
  for(let tick=0;tick<30*300&&world.phase!=='finished';tick++) {
    stepWorld(world,new Map(world.players.map(kart=>[kart.id,autopilot(kart,tick)])),1/30);
    triggered||=!!world.interactions?.length;boost||=world.players.some(kart=>kart.boost>0);jump||=world.players.some(kart=>kart.airborne);
    for(const kart of world.players)assert.ok([kart.x,kart.z,kart.elevation,kart.speed,kart.progress].every(Number.isFinite));
  }
  assert.ok(triggered&&boost&&jump);assert.ok(world.players.every(kart=>kart.finished&&kart.lap===3));
});
