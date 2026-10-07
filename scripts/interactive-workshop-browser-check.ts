import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,type Browser,type Page} from 'playwright';
import {createGameServer} from '../server/app.js';
import {autopilot,type AutopilotDriver} from '../shared/autopilot.js';
import type {StoredCustomTrack} from '../shared/custom-tracks.js';
import type {TrackInteractionState} from '../shared/track-interactions.js';

// Private server and temporary stores only. The shared driver below generates
// ordinary keyboard commands; this runner never writes simulation state.
const destination=resolve(process.env.REPORT_DIR??'docs/interactive-workshop');await mkdir(destination,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'lagon-interactive-workshop-'));
process.env.PLAYER_DATA_DIR=join(directory,'players');process.env.CUSTOM_TRACK_DATA_DIR=join(directory,'tracks');
const {gameServer,httpServer,ready}=createGameServer(resolve('dist/client'));await ready;await gameServer.listen(0,'127.0.0.1');
const address=httpServer.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
const checks:string[]=[],errors:string[]=[],captures:string[]=[],evidence:Record<string,unknown>={origin};
let browser:Browser|undefined,passed=false,failure:string|undefined;
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const mark=(message:string)=>{checks.push(message);console.log('✓ '+message);};
async function until(predicate:()=>Promise<boolean>,message:string,timeout=35_000){const end=Date.now()+timeout;while(!await predicate()){if(Date.now()>end)throw Error(message);await pause(100);}}
type Driver=AutopilotDriver&{id:string;progress:number;verticalVelocity:number;boost:number;lap:number;finished:boolean};
type State={phase:string|null;time:number;raceTime:number;round:number;trackId:string;sessionId:string|null;connected:boolean;players:number;kart:Driver|null;
  workshop:{selection:{group:string;index:number};label:string;startProgress:number;endProgress:number}|null;interactions:TrackInteractionState[]};
async function state(page:Page):Promise<State>{return page.evaluate(()=>{
  const debug=(window as unknown as {__lagonDebug:{world: {phase:string;time:number;raceTime:number;round:number;trackId:string;workshop:State['workshop'];interactions?:TrackInteractionState[];players:Driver[]}|null;sessionId:string|null;connected:boolean}}).__lagonDebug;
  const world=debug.world,kart=world?.players.find(kart=>kart.id===debug.sessionId);
  return {phase:world?.phase??null,time:world?.time??0,raceTime:world?.raceTime??0,round:world?.round??0,trackId:world?.trackId??'',sessionId:debug.sessionId,connected:debug.connected,players:world?.players.length??0,
    workshop:world?.workshop?{selection:{group:world.workshop.selection.group,index:world.workshop.selection.index},label:world.workshop.label,startProgress:world.workshop.startProgress,endProgress:world.workshop.endProgress}:null,
    interactions:world?.interactions?.map(item=>({id:item.id,triggeredAt:item.triggeredAt,activeAt:item.activeAt,expiresAt:item.expiresAt,triggeredBy:item.triggeredBy}))??[],
    kart:kart?{id:kart.id,trackId:kart.trackId,x:kart.x,z:kart.z,angle:kart.angle,speed:kart.speed,elevation:kart.elevation,airborne:kart.airborne,verticalVelocity:kart.verticalVelocity,progress:kart.progress,
      nextCheckpoint:kart.nextCheckpoint,resetCooldown:kart.resetCooldown,resetLatch:kart.resetLatch,item:kart.item,itemLatch:kart.itemLatch,epoch:kart.epoch,eventStage:kart.eventStage,eventLevel:kart.eventLevel,boost:kart.boost,lap:kart.lap,finished:kart.finished}:null};
});}
async function open(page:Page){page.setDefaultTimeout(30_000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'domcontentloaded',timeout:40_000});await page.waitForFunction(()=>!!(window as unknown as {__lagonDebug?:unknown}).__lagonDebug);}
async function field(page:Page,selector:string,value:string){await page.locator(selector).fill(value);await page.locator(selector).press('Tab');}
async function section(page:Page,id:string){if(await page.locator(id).getAttribute('open')===null)await page.locator(`${id}>summary`).click();}
async function capture(page:Page,name:string){await page.screenshot({path:join(destination,name),timeout:25_000});captures.push(name);}
const feature=(index:number,name:string)=>`[data-group="interactions"][data-index="${index}"][data-feature-field="${name}"]`;
const tryButton=(index:number)=>`[data-action="try-feature"][data-group="interactions"][data-index="${index}"]`;
async function records():Promise<StoredCustomTrack[]>{return (await fetch(origin+'/api/tracks',{signal:AbortSignal.timeout(10_000)}).then(response=>response.json()) as {tracks:StoredCustomTrack[]}).tracks;}
async function progression(page:Page){return page.evaluate(async()=>{
  const headers={Authorization:`Bearer ${localStorage.getItem('lagon-player-token')??''}`};
  const me=await fetch('/api/me',{headers}),replays=await fetch('/api/replays',{headers});if(!me.ok||!replays.ok)throw Error('Progression API inaccessible');
  const {profile}=await me.json(),recordings=await replays.json();return {xp:profile.xp,careerLevel:profile.careerLevel,completedChampionships:profile.completedChampionships,stats:profile.stats,mmr:profile.mmr,replays:recordings.replays.map((replay:{id:string})=>replay.id)};
});}
async function drive(page:Page,predicate:(value:State)=>boolean,label:string){
  const held=new Set<string>(),start=Date.now();let last=await state(page),seq=0,maxSpeed=0,maxElevation=0,maxVerticalVelocity=0,active=false;
  try{while(Date.now()-start<35_000){
    last=await state(page);if(!last.kart)throw Error('Kart absent pendant '+label);
    maxSpeed=Math.max(maxSpeed,last.kart.speed);maxElevation=Math.max(maxElevation,last.kart.elevation??0);maxVerticalVelocity=Math.max(maxVerticalVelocity,last.kart.verticalVelocity);
    active||=last.interactions.some(item=>last.time>=item.activeAt&&last.time<item.expiresAt);
    if(predicate(last))return {state:last,maxSpeed,maxElevation,maxVerticalVelocity,active,elapsedMs:Date.now()-start};
    const input=autopilot(last.kart,seq++),wanted=new Set<string>();
    if(input.throttle>0)wanted.add('ArrowUp');if(input.brake)wanted.add('ArrowDown');
    if(input.steer>.08)wanted.add('ArrowLeft');else if(input.steer<-.08)wanted.add('ArrowRight');
    for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    await pause(70);
  }throw Error(`${label} non atteint : ${JSON.stringify(last)}`);}finally{for(const key of held)await page.keyboard.up(key);}
}
try{
  const html=await fetch(origin,{signal:AbortSignal.timeout(10_000)}).then(response=>response.text());
  const assetPaths=[...html.matchAll(/(?:src|href)="([^\"]*assets[^\"]+)"/g)].map(match=>match[1]!);
  evidence.assets=await Promise.all(assetPaths.map(async path=>{const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(10_000)});assert.equal(response.status,200);return {path,status:response.status,bytes:(await response.arrayBuffer()).byteLength};}));
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const desktop=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});
  await desktop.addInitScript(origin=>{if(location.origin!==origin)return;localStorage.setItem('lagon-volume','0');},origin);
  const page=await desktop.newPage();await open(page);await page.locator('#name-input').fill('Atelier interactif');await page.locator('#track-editor-button').click();
  await field(page,'#editor-name','L’atelier des plaques');
  // Remove the template's permanent boost so observed acceleration proves the switch target.
  await page.locator('[data-action="remove-zone"][data-zone="0"]').click();
  await section(page,'#editor-interaction-options');await page.locator('#editor-add-switch-boost').click();await page.locator('#editor-add-switch-jump').click();
  for(const [index,trigger,start,duration]of[[0,12,19,4],[1,35,42,2.5]]){
    await field(page,feature(index!,'trigger'),String(trigger));await field(page,feature(index!,'start'),String(start));await field(page,feature(index!,'duration'),String(duration));
    await field(page,feature(index!,'width'),'16');await field(page,feature(index!,'activeSeconds'),'10');
  }
  await field(page,feature(1,'height'),'2');await field(page,feature(1,'launchSpeed'),'9');
  await page.locator('#editor-save').click();await until(async()=>/Circuit publié/.test(await page.locator('#editor-status').innerText()),'Publication UI explicite');
  const record=(await records()).find(item=>item.draft.name==='L’atelier des plaques');assert.ok(record);assert.equal(record.draft.interactions?.length,2);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'tracks',`${record.id}-v1.json`),'utf8')).draft,record.draft);
  evidence.source={id:record.id,revision:record.revision,interactions:record.draft.interactions};
  const before=await progression(page);evidence.progressionBefore=before;
  await page.locator('[data-feature-card="interactions-0"]').scrollIntoViewIfNeeded();await capture(page,'editor-interactive-modules.png');
  mark('Plaque turbo et plaque tremplin créées et configurées uniquement par UI ; source API et fichier privé identiques.');

  await page.locator(tryButton(0)).click();await until(async()=>{const value=await state(page);return value.phase==='racing'&&value.workshop?.selection.index===0;},'Atelier turbo démarré');
  const initial=await state(page);assert.ok(initial.kart&&initial.workshop);assert.match(initial.trackId,/^custom-private-/);assert.equal(initial.players,1);assert.match(await page.locator('#workshop-title').innerText(),/Interrupteur 1/);
  const turbo=await drive(page,value=>value.kart!.boost>0&&value.interactions.some(item=>value.time>=item.activeAt&&value.time<item.expiresAt),'turbo temporaire');
  assert.ok(turbo.active&&turbo.maxSpeed>5);evidence.turbo=turbo;await capture(page,'workshop-shared-turbo.png');
  await page.locator('#workshop-restart').click();await until(async()=>{const value=await state(page);return !!value.kart&&Math.hypot(value.kart.x-initial.kart!.x,value.kart.z-initial.kart!.z)<.1&&value.interactions.length===0;},'Retour à la même approche et réarmement');
  const repeated=await state(page);assert.ok(repeated.kart!.speed<.1);evidence.repeat={before:{x:initial.kart.x,z:initial.kart.z},after:{x:repeated.kart!.x,z:repeated.kart!.z},interactions:repeated.interactions};
  await page.locator('#leave-button').click();await page.locator('#track-editor-dialog').waitFor({state:'visible'});await section(page,'#editor-interaction-options');
  assert.equal(await page.locator(feature(0,'trigger')).inputValue(),'12');assert.equal(await page.locator(feature(0,'activeSeconds')).inputValue(),'10');
  mark('Essai turbo depuis son approche, effet physique observé après annonce, recommencement à la même position puis retour aux réglages conservés.');

  await page.locator(tryButton(1)).click();await until(async()=>{const value=await state(page);return value.phase==='racing'&&value.workshop?.selection.index===1;},'Atelier tremplin démarré');
  const jump=await drive(page,value=>!!value.kart?.airborne&&value.kart.verticalVelocity>3&&value.interactions.some(item=>value.time>=item.activeAt&&value.time<item.expiresAt),'impulsion du tremplin');
  assert.ok(jump.active&&jump.maxVerticalVelocity>3);evidence.jump=jump;
  // Continue ordinary driving until landing; no screenshot may hold throttle.
  await drive(page,value=>!value.kart!.airborne&&value.kart!.progress>jump.state.kart!.progress+5,'réception du tremplin');
  await page.locator('#leave-button').click();await page.locator('#track-editor-dialog').waitFor({state:'visible'});
  const after=await progression(page);assert.deepEqual(after,before);evidence.progressionAfter=after;
  assert.equal((await records()).length,1);assert.equal((await records())[0]!.revision,1,'private trials never publish another revision');
  assert.deepEqual((await records())[0]!.draft,record.draft,'the explicit publication remains unchanged during the private trials');
  mark('Impulsion active réelle et réception observées ; aucune progression, statistique, MMR ni replay modifiés après les séances.');

  await desktop.close();
  const mobile=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const phone=await mobile.newPage();await open(phone);await phone.locator('#name-input').fill('Atelier mobile');await phone.locator('#track-editor-button').click();
  await until(async()=>await phone.locator(`[data-action="copy"][data-id="${record.id}"]`).count()===1,'Circuit accessible sur mobile');
  await phone.locator(`[data-action="copy"][data-id="${record.id}"]`).click();await section(phone,'#editor-interaction-options');
  const card=phone.locator('[data-feature-card="interactions-0"]');await card.scrollIntoViewIfNeeded();
  const dimensions=await phone.locator('#editor-interaction-options button,#editor-interaction-options input').evaluateAll(nodes=>nodes.map(node=>({tag:node.tagName,label:node.getAttribute('aria-label')??node.textContent?.trim(),height:node.getBoundingClientRect().height,width:node.getBoundingClientRect().width,x:node.getBoundingClientRect().x,right:node.getBoundingClientRect().right})));assert.ok(dimensions.every(item=>item.height>=44&&item.width>=44&&item.x>=0&&item.right<=320.5));
  assert.equal(await phone.locator('#track-editor-dialog').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
  await field(phone,feature(0,'activeSeconds'),'12');assert.equal(await phone.locator(feature(0,'activeSeconds')).inputValue(),'12');
  await phone.locator('#editor-add-switch-boost').tap();assert.equal(await phone.locator('[data-feature-card^="interactions-"]').count(),3);
  await phone.locator('[data-action="remove-feature"][data-group="interactions"][data-index="2"]').tap();await card.scrollIntoViewIfNeeded();
  await capture(phone,'editor-interactions-mobile-320.png');evidence.mobile={viewport:{width:320,height:568},controls:dimensions};
  mark('Mobile 320 × 568 : réglages accessibles, boutons et champs ≥44px, modification tactile possible, aucun débordement du dialogue.');
  await mobile.close();await until(async()=>{const response=await fetch(origin+'/healthz').then(response=>response.json())as{rooms:number};return response.rooms===0;},'Fermeture des salons privés');
  assert.deepEqual(errors,[]);passed=true;
}catch(error){failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await gameServer.gracefullyShutdown(false);await rm(directory,{recursive:true,force:true});}
if(errors.length){passed=false;process.exitCode=1;failure??='Erreurs JavaScript détectées pendant le nettoyage';}
await writeFile(join(destination,'browser-validation.json'),JSON.stringify({passed,timestamp:new Date().toISOString(),checks,errors,captures,evidence,...(failure?{error:failure}:{}),
  fixtures:['Serveur/données privés et éphémères. Création et essais via UI ; conduite par commandes clavier normales calculées depuis les snapshots. Aucune mutation de trajectoire, position, progression ou résultat.'],
  remaining:['Téléphone physique et Safari iOS non testés.','La cohérence de deux clients sur une activation est vérifiée séparément par les tests réseau.']},null,2)+'\n');
console.log(JSON.stringify({passed,checks:checks.length,captures}));
