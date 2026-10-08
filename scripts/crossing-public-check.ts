import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { CUSTOM_TRACK_TEMPLATES, registerCustomTrackPreview, releaseCustomTrackPreview, type CustomTrackPreview } from '../shared/custom-tracks.js';
import { autopilot } from '../shared/autopilot.js';
import type { World } from '../shared/game.js';
import type { TrackDefinition } from '../shared/track.js';

const origin=process.env.BASE_URL?.replace(/\/$/,'');assert.ok(origin&&/^https?:\/\//.test(origin),'BASE_URL must explicitly select the deployed server.');
const destination=resolve(process.env.REPORT_DIR??'docs/multilevel-tracks');await mkdir(destination,{recursive:true});
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const checks:string[]=[],errors:string[]=[],passages:Array<{floor:string;raceTime:number;routeProgress:number;elevation:number;x:number;z:number}>=[];
let room:Room|undefined,world:World|undefined,track:TrackDefinition|undefined,previewId='',timer:ReturnType<typeof setInterval>|undefined;
let seq=0,epoch=-1,snapshots=0,inputs=0,previewMessages=0,passed=false,failure:string|undefined,assets:string[]=[],before:unknown,after:unknown,healthBefore:unknown,healthAfter:unknown;
const startedAt=new Date().toISOString();
async function json(path:string){const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);return response.json();}
async function until(predicate:()=>boolean,label:string,timeout=15000){const deadline=Date.now()+timeout;while(!predicate()){if(Date.now()>deadline)throw Error(`Timeout: ${label}`);await pause(50);}}
function mark(message:string){checks.push(message);console.log('✓ '+message);}
try{
  before=await json('/api/tracks');healthBefore=await json('/healthz');
  const html=await fetch(origin,{signal:AbortSignal.timeout(15000)}).then(response=>response.text());assets=[...html.matchAll(/(?:src|href)="([^\"]*assets[^\"]+)"/g)].map(match=>match[1]!);
  const draft=structuredClone(CUSTOM_TRACK_TEMPLATES.find(template=>template.id==='figure-eight')!.draft);
  room=await new Client(origin.replace(/^http/,'ws')).create('race',{name:'Validation étages tunnel',practice:true,previewDraft:draft,workshop:{group:'track',index:0}});
  room.onError((code,message)=>errors.push(`Colyseus ${code}: ${message??''}`));room.onMessage('notice',()=>{});
  room.onMessage('snapshot',({world:value,previewTrack}:{world:World;previewTrack?:CustomTrackPreview})=>{
    snapshots++;world=value;
    if(previewTrack){track=registerCustomTrackPreview(previewTrack);previewId=previewTrack.id;previewMessages++;room!.send('tracksReady',{ids:[previewId]});}
    if(!track||world.phase!=='racing')return;
    const kart=world.players.find(kart=>kart.id===room!.sessionId);if(!kart)return;
    const crossing=track.crossings![0]!;
    for(const floor of ['lower','upper']as const){
      if(passages.some(passage=>passage.floor===floor))continue;
      const progress=kart.routeProgress??kart.progress,target=floor==='lower'?crossing.lowerProgress:crossing.upperProgress;
      if(Math.abs(progress-target)>5||Math.hypot(kart.x-crossing.x,kart.z-crossing.z)>track.width*.6)continue;
      if(Math.abs(kart.elevation-(floor==='lower'?0:5.7))>.5)continue;
      passages.push({floor,raceTime:world.raceTime,routeProgress:progress,elevation:kart.elevation,x:kart.x,z:kart.z});
    }
  });
  await until(()=>!!track&&world?.players.length===1,'private preview received and registered');
  assert.equal(world!.practice,true);assert.equal(world!.ranked,false);assert.equal(world!.workshop?.selection.group,'track');assert.equal(track!.crossings?.length,1);
  assert.ok(world!.players.every(kart=>!kart.playerId&&!kart.cpu));
  if(world!.phase==='lobby'){room.send('ready',{ready:true});await until(()=>world!.players.every(kart=>kart.ready),'solo ready');room.send('start');}
  await until(()=>world?.phase==='racing','private solo workshop started');
  mark('Aperçu privé reçu par WSS, reconstruit localement puis acquitté via tracksReady, sans profil ni publication.');
  timer=setInterval(()=>{
    const kart=world?.players.find(kart=>kart.id===room!.sessionId);if(!kart||world?.phase!=='racing'||!room?.connection.isOpen)return;
    if(epoch!==kart.epoch){epoch=kart.epoch;seq=Math.max(0,kart.lastSeq+1);}
    room.send('input',autopilot(kart,seq++,true));inputs++;
  },1000/30);
  await until(()=>passages.length===2,'lower and upper passages through the public tunnel',60000);
  assert.deepEqual(errors,[]);mark('Conduite par commandes SDK : passage inférieur à0m puis supérieur à5.7m sur le Docker déployé via le tunnel public.');passed=true;
}catch(error){failure=String(error);console.error(error);process.exitCode=1;}
finally{
  clearInterval(timer);if(room?.connection.isOpen)await room.leave();if(previewId)releaseCustomTrackPreview(previewId);
  try{after=await json('/api/tracks');healthAfter=await json('/healthz');assert.deepEqual(after,before);mark('Catalogue public inchangé avant/après ; connexion fermée et aperçu local libéré.');}catch(error){errors.push(String(error));passed=false;process.exitCode=1;}
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)??'null').digest('hex');
await writeFile(join(destination,'public-smoke.json'),JSON.stringify({passed,startedAt,finishedAt:new Date().toISOString(),origin,assets,checks,errors,...(failure?{failure}:{}),
  scope:'Atelier privé SOLO en mode entraînement sur le Docker public via HTTPS/WSS. Aucun profil, compte ou circuit publié. Vraies commandes SDK à30Hz et lecture de snapshots, aucune mutation de simulation. Ne constitue pas un test de course multijoueur publique.',
  mode:{practice:world?.practice,ranked:world?.ranked,workshop:world?.workshop?.selection,players:world?.players.length},passages,
  snapshots,inputs,previewMessages,tracksReadySent:previewMessages,connectionClosed:room?!room.connection.isOpen:true,
  catalogue:{unchanged:hash(before)===hash(after),beforeHash:hash(before),afterHash:hash(after)},healthBefore,healthAfter,
  remaining:['Rendu navigateur non testé par ce smoke SDK.','La course normale complète àdeux est couverte par network-validation.json sur serveur privé.']},null,2)+'\n');
console.log(JSON.stringify({passed,passages:passages.length,snapshots,inputs}));
