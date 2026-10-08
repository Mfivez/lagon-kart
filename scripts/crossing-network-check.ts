import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { createGameServer } from '../server/app.js';
import { CustomTrackStore } from '../server/custom-track-store.js';
import { CUSTOM_TRACK_TEMPLATES, compileCustomTrack, type StoredCustomTrack } from '../shared/custom-tracks.js';
import { autopilot } from '../shared/autopilot.js';
import { type World } from '../shared/game.js';
import { getTrack, trackElevation, type TrackDefinition } from '../shared/track.js';

const destination = resolve(process.env.REPORT_DIR ?? 'docs/multilevel-tracks');
await mkdir(destination, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'lagon-crossing-network-'));
process.env.PLAYER_DATA_DIR = join(directory, 'players');
process.env.CUSTOM_TRACK_DATA_DIR = join(directory, 'tracks');
const app = createGameServer(resolve('dist/client'));
const startedAt = new Date().toISOString(), checks: string[] = [], errors: string[] = [], notices: string[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type Peer = { room: Room; world?: World; seq: number; epoch: number; snapshots: number; inputs: number };
type Passage = { driver: string; floor: 'lower' | 'upper'; raceTime: number; routeProgress: number; progress: number; lap: number; elevation: number; roadHeight: number; x: number; z: number };
const peers: Peer[] = [], passages: Passage[] = [];
let timer: ReturnType<typeof setInterval> | undefined, origin = '', roomId = '', passed = false, failure: string | undefined;
let track: TrackDefinition | undefined, finalWorld: World | undefined, persistence: unknown, healthAfter: unknown;
function mark(message: string) { checks.push(message); console.log('✓ ' + message); }
async function until(predicate: () => boolean | Promise<boolean>, label: string, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!await predicate()) { if (Date.now() > deadline) throw Error(`Timeout: ${label}`); await pause(50); }
}
function attach(room: Room, observer = false) {
  const peer: Peer = { room, seq: 0, epoch: -1, snapshots: 0, inputs: 0 }; peers.push(peer);
  room.onMessage('notice', ({message}: {message:string}) => notices.push(message));
  room.onError((code, message) => errors.push(`Colyseus ${code}: ${message ?? ''}`));
  room.onMessage('snapshot', ({world}: {world:World}) => {
    peer.world = world; peer.snapshots++;
    if (!observer || !track || world.phase !== 'racing') return;
    finalWorld = world;
    const crossing = track.crossings![0]!;
    for (const kart of world.players) for (const floor of ['lower','upper'] as const) {
      if (passages.some(passage => passage.driver === kart.name && passage.floor === floor)) continue;
      const progress = kart.routeProgress ?? kart.progress, target = floor === 'lower' ? crossing.lowerProgress : crossing.upperProgress;
      if (Math.abs(progress - target) > 5 || Math.hypot(kart.x - crossing.x, kart.z - crossing.z) > track.width * .6) continue;
      const roadHeight = trackElevation(progress, track.id);
      if (Math.abs(kart.elevation - roadHeight) > .8) continue;
      passages.push({ driver:kart.name, floor, raceTime:world.raceTime, routeProgress:progress, progress:kart.progress, lap:kart.lap, elevation:kart.elevation, roadHeight, x:kart.x, z:kart.z });
    }
  });
  return peer;
}
try {
  await app.ready; await app.gameServer.listen(0, '127.0.0.1');
  const address = app.httpServer.address(); assert.ok(address && typeof address !== 'string'); origin = `http://127.0.0.1:${address.port}`;
  const profileResponse = await fetch(origin + '/api/profile', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Créateur validation étages'})});
  assert.equal(profileResponse.status, 201);
  const identity = await profileResponse.json() as {token:string}; assert.ok(identity.token);
  const draft = structuredClone(CUSTOM_TRACK_TEMPLATES.find(template => template.id === 'figure-eight')!.draft);
  draft.name = 'Validation réseau huit superposé'; draft.lapCount = 1;
  const saveResponse = await fetch(origin + '/api/tracks', {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${identity.token}`},body:JSON.stringify({draft})});
  assert.equal(saveResponse.status, 201);
  const saved = (await saveResponse.json() as {track:StoredCustomTrack}).track;
  track = getTrack(saved.runtimeId); assert.equal(track.crossings?.length, 1);
  const files = await readdir(join(directory,'tracks')); assert.equal(files.length, 1);
  const disk = JSON.parse(await readFile(join(directory,'tracks',files[0]!), 'utf8')) as StoredCustomTrack;
  assert.deepEqual(disk.draft,draft);
  const reloaded = await CustomTrackStore.open(join(directory,'tracks'));
  assert.deepEqual(reloaded.get(saved.runtimeId!)?.draft, draft);
  assert.deepEqual(compileCustomTrack(reloaded.get(saved.runtimeId!)!).crossings, track.crossings);
  persistence = {files:files.length,revision:saved.revision,runtimeId:saved.runtimeId,draftRestored:true,crossingsRestored:true};
  mark('Circuit publié par API privée, source enregistrée sur disque et étages identiques après ouverture d’un nouveau store.');
  const host = attach(await new Client(origin.replace(/^http/,'ws')).create('race',{name:'Étage réseau 1',trackId:track.id,practice:false}), true);
  roomId = host.room.roomId;
  attach(await new Client(origin.replace(/^http/,'ws')).joinById(roomId,{name:'Étage réseau 2'}));
  await until(() => peers.every(peer => peer.world?.players.length === 2), 'two independent SDK clients');
  assert.equal(host.world!.practice,false); assert.equal(host.world!.ranked,false); assert.equal(host.world!.workshop,undefined);
  assert.ok(host.world!.players.every(kart => !kart.playerId && !kart.cpu));
  for (const peer of peers) peer.room.send('ready',{ready:true});
  await until(() => host.world!.players.every(kart => kart.ready),'both ready'); host.room.send('start');
  await until(() => peers.every(peer => peer.world?.phase === 'racing'),'normal race countdown');
  mark('Deux clients SDK anonymes dans une course normale à un tour, hors entraînement et hors atelier.');
  timer = setInterval(() => {
    for (const peer of peers) {
      const kart = peer.world?.players.find(kart => kart.id === peer.room.sessionId);
      if (!kart || kart.finished || peer.world?.phase !== 'racing' || !peer.room.connection.isOpen) continue;
      if (peer.epoch !== kart.epoch) {peer.epoch=kart.epoch;peer.seq=Math.max(0,kart.lastSeq+1);}
      peer.room.send('input',autopilot(kart,peer.seq++,true)); peer.inputs++;
    }
  }, 1000 / 30);
  let lastLog = 0;
  await until(() => {
    if (Date.now()-lastLog > 10_000) { lastLog=Date.now(); console.log(host.world?.players.map(kart=>`${kart.name}: ${kart.progress.toFixed(0)}m, hauteur ${kart.elevation.toFixed(2)}, tour ${kart.lap}`).join(' / ')); }
    return peers.every(peer => peer.world?.phase === 'finished');
  }, 'complete one-lap race', 130_000);
  finalWorld = host.world!;
  assert.ok(finalWorld.players.every(kart => kart.finished && kart.lap === 1));
  const result = finalWorld.players.map(kart => ({id:kart.id,rank:kart.rank,lap:kart.lap,finished:kart.finished})).sort((a,b)=>a.rank-b.rank);
  for (const peer of peers) assert.deepEqual(peer.world!.players.map(kart=>({id:kart.id,rank:kart.rank,lap:kart.lap,finished:kart.finished})).sort((a,b)=>a.rank-b.rank),result);
  assert.equal(passages.length,4,'each driver must pass underneath and above the same crossing');
  for (const passage of passages) assert.ok(Math.abs(passage.elevation-(passage.floor==='lower'?0:5.7))<.8);
  mark('Les deux pilotes passent sous le pont puis dessus, terminent le tour et reçoivent le même classement.');
  assert.deepEqual(errors,[]); passed=true;
} catch (error) { failure=String(error);console.error(error);process.exitCode=1; }
finally {
  clearInterval(timer);
  for (const peer of peers) if (peer.room.connection.isOpen) await peer.room.leave();
  if (origin) await until(async()=>{healthAfter=await fetch(origin+'/healthz').then(response=>response.json());return (healthAfter as {rooms:number}).rooms===0;},'private rooms closed',5000).catch(error=>{errors.push(String(error));passed=false;process.exitCode=1;});
  await app.gameServer.gracefullyShutdown(false); await rm(directory,{recursive:true,force:true});
}
await writeFile(join(destination,'network-validation.json'),JSON.stringify({passed,startedAt,finishedAt:new Date().toISOString(),origin,roomId,checks,errors,notices,persistence,passages,
  race:finalWorld?{phase:finalWorld.phase,practice:finalWorld.practice,ranked:finalWorld.ranked,trackId:finalWorld.trackId,raceTime:finalWorld.raceTime,players:finalWorld.players.map(kart=>({name:kart.name,lap:kart.lap,finished:kart.finished,rank:kart.rank,finishTime:kart.finishTime}))}:null,
  peers:peers.map(peer=>({snapshots:peer.snapshots,inputs:peer.inputs,closed:!peer.room.connection.isOpen})),healthAfter,...(failure?{failure}:{}),
  scope:'Serveur Colyseus privé sur sources partagées, profil de publication jetable et deux SDK anonymes à 30Hz. Seulement API, commandes et snapshots ; aucune mutation de la simulation. Serveur et données temporaires supprimés.',
  remaining:['Le rechargement persistant ouvre un nouveau store sur les fichiers, sans redémarrer le processus serveur.','Ce scénario ne mesure pas le rendu navigateur ni la latence du tunnel public.']},null,2)+'\n');
console.log(JSON.stringify({passed,checks:checks.length,passages:passages.length,raceSeconds:finalWorld?.raceTime}));
