import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client, type Room } from 'colyseus.js';
import { autopilot } from '../shared/autopilot.js';
import { CUSTOM_TRACK_TEMPLATES, customTrackRuntimeId, registerCustomTrack, validateCustomTrackDraft,
  type StoredCustomTrack } from '../shared/custom-tracks.js';
import { getTrack, trackPoint, type World } from '../shared/game.js';
import type { PlayerProfile } from '../shared/progression.js';

// Actual HTTP/WebSocket traffic only. SDK guests emit normal inputs; RaceRoom
// drives the six CPU. No fixture, state injection or artificial progression.
const origin = process.env.BASE_URL?.replace(/\/$/, '');
const reportPath = resolve(process.env.REPORT_PATH || 'docs/editor/race-validation.json');
type Account = { token: string; profile: PlayerProfile };
type Health = { status: string; rooms: number };
type Snapshot = { world: World; tracks?: StoredCustomTrack[] };
type Observer = { room: Room; account: Account; world?: World; snapshots: number; commands: number;
  sequence: number; epoch: number; definitions: Set<string>; definitionsReceived: number; acknowledgments: number };
type ProgressObservation = { cpu: boolean; name: string; bestProgress: number; lastAdvance: number;
  maximumNoProgressSeconds: number; previousResetCooldown: number; observedResets: number };
const started = Date.now(), checks: string[] = [], notices: string[] = [], errors: string[] = [];
const clients: Observer[] = [], observations = new Map<string, ProgressObservation>();
let first: StoredCustomTrack | undefined, second: StoredCustomTrack | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let initialHealth: Health | undefined, finalHealth: Health | undefined;
let success = false, failure = '', bundle = '', publishedDuringRaceAt = 0;
let results: Array<{ id: string; cpu: boolean; rank: number; lap: number; finished: boolean; finishTime: number }> = [];
let savedProfiles: Array<{ id: string; xp: number; stats: PlayerProfile['stats'] }> = [];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const record = (label: string) => { checks.push(label); console.log('✓ ' + label); };
async function until(condition: () => boolean | Promise<boolean>, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!await condition()) {
    if (errors.length) throw new Error(errors.join('; '));
    if (Date.now() > deadline) throw new Error('Délai dépassé : ' + label);
    await sleep(80);
  }
}
async function api<T>(path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const response = await fetch(origin + path, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json() as T & { error?: string };
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status} ${data.error ?? ''}`);
  return data;
}
function subscribe(room: Room, account: Account): Observer {
  const client: Observer = { room, account, snapshots: 0, commands: 0, sequence: 0, epoch: -1,
    definitions: new Set(), definitionsReceived: 0, acknowledgments: 0 };
  clients.push(client);
  room.onError((code,message) => errors.push(`Colyseus ${code}: ${message ?? ''}`));
  room.onMessage('notice', (notice: { message: string }) => {
    notices.push(notice.message); if (/échoué|erreur|invalide/i.test(notice.message)) errors.push(notice.message);
  });
  room.onMessage('snapshot', (snapshot: Snapshot) => {
    try {
      if (snapshot.tracks?.length) {
        const ids: string[] = [];
        for (const source of snapshot.tracks) {
          const id = customTrackRuntimeId(source);
          if (!client.definitions.has(id)) registerCustomTrack(source);
          client.definitions.add(id); ids.push(id); client.definitionsReceived++;
        }
        room.send('tracksReady', { ids }); client.acknowledgments++;
      }
      client.world = snapshot.world; client.snapshots++;
      if (first) assert.equal(snapshot.world.trackId, customTrackRuntimeId(first), 'Une révision publiée pendant la course ne remplace pas le tracé en cours.');
      if (client !== clients[0] || !['racing','finished'].includes(snapshot.world.phase)) return;
      for (const kart of snapshot.world.players.filter(player => !player.spectator)) {
        const observation = observations.get(kart.id) ?? { cpu: kart.cpu, name: kart.name, bestProgress: kart.progress,
          lastAdvance: snapshot.world.raceTime, maximumNoProgressSeconds: 0, previousResetCooldown: 0, observedResets: 0 };
        if (kart.progress > observation.bestProgress + .5) { observation.bestProgress = kart.progress; observation.lastAdvance = snapshot.world.raceTime; }
        if (!kart.finished) observation.maximumNoProgressSeconds = Math.max(observation.maximumNoProgressSeconds, snapshot.world.raceTime - observation.lastAdvance);
        if (kart.resetCooldown > observation.previousResetCooldown + .5) observation.observedResets++;
        observation.previousResetCooldown = kart.resetCooldown; observations.set(kart.id,observation);
      }
    } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  });
  return client;
}

async function main() {
  try {
    assert.ok(origin && /^https?:\/\//.test(origin), 'BASE_URL doit désigner explicitement le serveur à vérifier.');
    initialHealth = await api<Health>('/healthz'); assert.equal(initialHealth.status,'ok');
    const html = await fetch(origin!).then(response => response.text());
    bundle = /src="([^"\s]+\/index-[^"\s]+\.js)"/.exec(html)?.[1] ?? '';
    const accounts = await Promise.all(['Validation éditeur A','Validation éditeur B'].map(name => api<Account>('/api/profile', undefined, {name})));
    assert.ok(accounts.every(account => account.profile.stats.races === 0));
    const draft = structuredClone(CUSTOM_TRACK_TEMPLATES[0]!.draft);
    draft.name = 'Boucle de validation'; draft.anchors[1]!.x += 5;
    assert.equal(validateCustomTrackDraft(draft).ok,true);
    first = (await api<{track:StoredCustomTrack}>('/api/tracks', accounts[0]!.token,{draft})).track;
    const firstId = customTrackRuntimeId(first);
    assert.equal(first.revision,1);
    const sourceBefore = (await api<{track:StoredCustomTrack}>(`/api/tracks/${firstId}`)).track;
    assert.deepEqual(sourceBefore,first);
    record('Circuit v1 créé par HTTP, source et auteur conservés dans la bibliothèque.');

    const host = subscribe(await new Client(origin!.replace(/^http/,'ws')).create('race', {
      name: accounts[0]!.profile.name, token: accounts[0]!.token, trackId:firstId, color:'#fc735d',
    }), accounts[0]!);
    await until(()=>!!host.world && host.definitions.has(firstId),'définition v1 reçue par le premier SDK');
    const guest = subscribe(await new Client(origin!.replace(/^http/,'ws')).joinById(host.room.roomId, {
      name:accounts[1]!.profile.name, token:accounts[1]!.token, color:'#69cbd0',
    }), accounts[1]!);
    await until(()=>!!guest.world && guest.definitions.has(firstId) && host.world?.players.length===2,'deuxième SDK et transmission du circuit');
    host.room.send('configure',{cpuCount:6});
    await until(()=>clients.every(client=>client.world?.players.length===8 && client.world.players.filter(kart=>kart.cpu).length===6),'six CPU créés par le serveur');
    assert.ok(clients.every(client => client.world!.players.find(kart=>kart.id===client.room.sessionId)?.playerId===client.account.profile.id));
    record('Deux connexions Colyseus indépendantes, définition v1 reçue et acquittée par chacune, six CPU serveur.');
    host.room.send('ready',{ready:true}); guest.room.send('ready',{ready:true});
    await until(()=>host.world!.players.every(kart=>kart.ready),'huit pilotes prêts');
    host.room.send('start'); await until(()=>clients.every(client=>client.world?.phase==='racing'),'départ synchronisé');
    timer = setInterval(()=> {
      for (const client of clients) {
        const kart = client.world?.players.find(player=>player.id===client.room.sessionId);
        if (!kart || kart.finished || client.world?.phase!=='racing' || !client.room.connection.isOpen) continue;
        if (kart.epoch !== client.epoch) { client.epoch=kart.epoch; client.sequence=Math.max(0,kart.lastSeq+1); }
        client.room.send('input',autopilot(kart,client.sequence++,true)); client.commands++;
      }
    },1000/30);
    await until(()=>host.world!.raceTime>=20,'publication pendant la course',40000);
    publishedDuringRaceAt=host.world!.raceTime;
    const oldTrack = getTrack(firstId), oldPoint = trackPoint(123,firstId);
    const changed = structuredClone(first.draft); changed.name='Boucle de validation — version 2'; changed.anchors.forEach(point=>{point.x*=1.08;});
    assert.equal(validateCustomTrackDraft(changed).ok,true);
    second = (await api<{track:StoredCustomTrack}>(`/api/tracks/${first.id}`,accounts[0]!.token,{draft:changed,revision:first.revision},'PUT')).track;
    assert.equal(second.revision,2); const secondId=customTrackRuntimeId(second); registerCustomTrack(second);
    assert.notEqual(getTrack(secondId).length,oldTrack.length); assert.equal(getTrack(firstId),oldTrack);
    assert.deepEqual(trackPoint(123,firstId),oldPoint);
    assert.deepEqual((await api<{track:StoredCustomTrack}>(`/api/tracks/${firstId}`)).track,sourceBefore);
    const published = (await api<{tracks:StoredCustomTrack[]}>('/api/tracks')).tracks.filter(track=>track.id===first!.id);
    assert.equal(published.length,1); assert.equal(published[0]!.revision,2);
    assert.ok(clients.every(client=>client.world?.trackId===firstId && client.world.players.every(kart=>kart.trackId===firstId)));
    record('Version 2 publiée pendant la course : catalogue actualisé, source v1 inchangée et huit pilotes toujours sur v1.');
    let nextLog=0;
    await until(()=> {
      if (Date.now()>nextLog) {
        nextLog=Date.now()+15000;
        console.log(host.world!.players.map(kart=>`${kart.name}: ${kart.lap}/3`).join(' · '));
      }
      return clients.every(client=>client.world?.phase==='finished');
    },'course complète de huit pilotes',240000);
    clearInterval(timer); timer=undefined;
    const racers=host.world!.players.filter(kart=>!kart.spectator);
    assert.equal(racers.length,8); assert.equal(racers.filter(kart=>kart.cpu).length,6);
    assert.ok(racers.every(kart=>kart.finished && kart.lap===3),'Chaque pilote doit franchir toutes les portes des trois tours.');
    assert.equal(new Set(racers.map(kart=>kart.rank)).size,8);
    results=racers.map(({id,cpu,rank,lap,finished,finishTime})=>({id,cpu,rank,lap,finished,finishTime}));
    for (const client of clients) assert.deepEqual(client.world!.players.map(kart=>[kart.id,kart.rank,kart.finished]),racers.map(kart=>[kart.id,kart.rank,kart.finished]));
    record('8/8 arrivées après trois tours, classement identique transmis aux deux SDK.');
    for (const observation of observations.values()) if(observation.cpu) {
      assert.ok(observation.maximumNoProgressSeconds<12,`${observation.name}: stagnation ${observation.maximumNoProgressSeconds.toFixed(1)}s`);
      assert.ok(observation.observedResets<=3,`${observation.name}: resets répétés`);
    }
    record('Les six CPU progressent : aucun blocage de 12 secondes, au maximum trois récupérations observées par CPU.');
    await until(async()=> {
      const profiles=await Promise.all(accounts.map(account=>api<{profile:PlayerProfile}>('/api/me',account.token)));
      savedProfiles=profiles.map(({profile})=>({id:profile.id,xp:profile.xp,stats:profile.stats}));
      return savedProfiles.every(profile=>profile.stats.races===1 && profile.stats.finishes===1 && profile.xp>0 && profile.stats.bestTimes[firstId]>0);
    },'progression réelle enregistrée pour les deux invités');
    assert.deepEqual(errors,[]);
    record('Progression de la course réellement sauvegardée pour les deux invités : course, arrivée, XP et meilleur temps sur v1.');
    success=true;
  } catch(error) { failure=error instanceof Error?error.message:String(error); }
  finally {
    clearInterval(timer);
    const closed=await Promise.allSettled(clients.map(async client=>{if(client.room.connection.isOpen) await client.room.leave();}));
    for(const result of closed) if(result.status==='rejected') errors.push(`Fermeture: ${String(result.reason)}`);
    try {
      finalHealth=await api<Health>('/healthz'); assert.equal(finalHealth.status,'ok');
      assert.ok(clients.every(client=>!client.room.connection.isOpen));
      record('Les deux connexions du test sont fermées ; serveur sain, autres salons laissés intacts.');
    } catch(error) { failure ||= error instanceof Error?error.message:String(error); success=false; }
    if(errors.length) success=false;
    await mkdir(dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify({origin,bundle,success,failure,checks,errors,notices,
      startedAt:new Date(started).toISOString(),durationSeconds:(Date.now()-started)/1000,
      scope:'Real HTTP and Colyseus SDK connections. Two authenticated SDK guests send normal autopilot inputs; six CPU are driven by RaceRoom. No browser or touch ergonomics claim. No forced position, checkpoint, finish, profile or XP.',
      browser:false,initialHealth,finalHealth,publishedDuringRaceAt,
      versions:[first,second].filter(Boolean).map(track=>({id:track!.id,revision:track!.revision,runtimeId:customTrackRuntimeId(track!),name:track!.draft.name})),
      clients:clients.map(client=>({roomId:client.room.roomId,playerId:client.account.profile.id,sessionId:client.room.sessionId,
        snapshots:client.snapshots,commands:client.commands,definitions:[...client.definitions],definitionsReceived:client.definitionsReceived,acknowledgments:client.acknowledgments})),
      results,observations:[...observations].map(([id,observation])=>({id,...observation})),savedProfiles,
      resetMeasurement:'Observed rises of resetCooldown >0.5 seconds between snapshots. No private instrumentation.',
      cleanup:'Only the two created SDK connections leave their room. Global rooms=0 is deliberately not required on a shared validation server.'},null,2)+'\n');
  }
  assert.ok(success,failure || errors.join('; ') || 'Course personnalisée non validée.');
}
// Colyseus installs an uncaughtException observer: force a non-zero exit on a failed check.
main().catch(error=>{console.error(error);process.exitCode=1;});
