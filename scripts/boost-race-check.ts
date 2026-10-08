/** Normal multiplayer race on an explicitly selected running deployment.
 * Real touch controls and one SDK opponent; no positions, items or results injected. */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium, type Browser, type CDPSession, type Page} from 'playwright';
import {Client, type Room} from 'colyseus.js';
import {autopilot} from '../shared/autopilot.js';
import {type World, type Kart} from '../shared/game.js';
import {getKartStats} from '../shared/garage.js';

const origin=process.env.BASE_URL?.replace(/\/$/,''); assert.ok(origin,'BASE_URL required');
const journal=JSON.parse(await readFile(process.env.IDENTITY_FILE||'/tmp/lagon-ux-public-identities.json','utf8'));
assert.equal(journal.origin,origin); assert.equal(journal.identities.length,2);
const output=resolve(process.env.REPORT_DIR||'docs/boost-normal-race'); await mkdir(output,{recursive:true});
const report:Record<string,unknown>={origin,startedAt:new Date().toISOString(),fixtures:[],inputMethod:'Browser driver uses real CDP touch joystick/item/drift controls. SDK opponent sends ordinary bounded inputs. No server access or state injection.'};
const requireItem=process.env.EXPECT_ITEM==='1', tryDrift=process.env.TRY_DRIFT==='1';
const checks:string[]=[],errors:string[]=[],samples:Array<Record<string,unknown>>=[],pads:Array<Record<string,unknown>>=[],items:Array<Record<string,unknown>>=[],drifts:Array<Record<string,unknown>>=[];
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn:()=>boolean|Promise<boolean>,label:string,ms=30000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error(label);await sleep(60);}}
async function api(path:string,token?:string){const response=await fetch(origin+path,{signal:AbortSignal.timeout(20000),headers:token?{authorization:'Bearer '+token}:{}});assert.ok(response.ok,`${path} HTTP${response.status}`);return response.json();}
let browser:Browser|undefined,page:Page|undefined,cdp:CDPSession|undefined,peer:Room|undefined,world:World|undefined,hostId='',peerTimer:ReturnType<typeof setInterval>|undefined;
let sequence=0,epoch=-1,previous:Kart|undefined,previousTime=0,screenshot=false,passed=false;
let pendingPad:Record<string,unknown>|undefined,pendingItem:Record<string,unknown>|undefined,pendingDrift:Record<string,unknown>|undefined;
let itemPressed=false,driftPressed=false,driftAttempted=false;
const held=new Map<number,{id:number;x:number;y:number;radiusX:number;radiusY:number}>();
const controls=new Map<string,{x:number;y:number;width:number;height:number}>();
const mark=(value:string)=>{checks.push(value);console.log('✓ '+value);};
async function touch(id:number,selector:string,x=.5,y=.5){const b=controls.get(selector)!;const existing=held.has(id);held.set(id,{id,x:b.x+b.width*x,y:b.y+b.height*y,radiusX:3,radiusY:3});await cdp!.send('Input.dispatchTouchEvent',{type:existing?'touchMove':'touchStart',touchPoints:[...held.values()]});}
async function release(id:number){if(!held.delete(id))return;await cdp!.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[...held.values()]});}
async function capture(name:string){const png=await cdp!.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false});await writeFile(join(output,name),Buffer.from(png.data,'base64'));}
try{
 report.healthBefore=await api('/healthz');
 const html=await fetch(origin).then(r=>r.text());report.assets=[...html.matchAll(/(?:src|href)="([^"]*assets[^\"]+)"/g)].map(m=>m[1]);
 const identities=journal.identities;
 for(const identity of identities){const current=await api('/api/me',identity.token);assert.equal(current.profile.id,identity.profile.id);}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await context.addInitScript(({origin,token,name})=>{if(location.origin!==origin)return;localStorage.setItem('lagon-player-token',token);localStorage.setItem('lagon-name',name);localStorage.setItem('lagon-volume','0');localStorage.setItem('lagon-graphics-quality','smooth');localStorage.setItem('lagon-touch-auto','false');},{origin,token:identities[0].token,name:identities[0].profile.name});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);});
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#create-button').click();
 await page.locator('#room-code').waitFor({state:'visible'});const code=(await page.locator('#room-code').innerText()).trim();report.roomId=code;
 hostId=await page.evaluate(()=>(window as unknown as {__lagonDebug:{sessionId:string}}).__lagonDebug.sessionId);
 peer=await new Client(origin.replace(/^http/,'ws')).joinById(code,{token:identities[1].token,name:identities[1].profile.name});
 peer.onMessage('notice',()=>{});peer.onError((code,message)=>errors.push(`Colyseus ${code}: ${message}`));
 peer.onMessage('snapshot',({world:value}:{world:World})=>{
  world=value;if(value.phase!=='racing')return;
  const kart=value.players.find(p=>p.id===hostId);if(!kart)return;
  const sample={time:value.raceTime,lap:kart.lap,speed:kart.speed,boost:kart.boost,surface:kart.surface,padZone:kart.padZone,driftCharge:kart.driftCharge,item:kart.item,charges:kart.itemCharges,stun:kart.stun};samples.push(sample);
  if(previous){
   for(const [zone,lap]of Object.entries(kart.padLaps))if(previous.padLaps[zone]!==lap){pendingPad={zone,lap,duration:1.05,time:value.raceTime,beforeSpeed:previous.speed,activationBoost:kart.boost,peakSpeed:kart.speed,normalLimit:getKartStats(kart.build).speed};pads.push(pendingPad);}
   if(previous.item&&['turbo','tripleTurbo'].includes(previous.item)&& (kart.item!==previous.item||kart.itemCharges<previous.itemCharges)){pendingItem={kind:previous.item,duration:previous.item==='tripleTurbo'?1.65:2.2,time:value.raceTime,beforeSpeed:previous.speed,activationBoost:kart.boost,peakSpeed:kart.speed,chargesBefore:previous.itemCharges,chargesAfter:kart.itemCharges,normalLimit:getKartStats(kart.build).speed};items.push(pendingItem);}
   if(previous.driftCharge>=.65&&kart.driftCharge===0&&kart.boost>previous.boost){pendingDrift={time:value.raceTime,charge:previous.driftCharge,beforeSpeed:previous.speed,activationBoost:kart.boost,peakSpeed:kart.speed};drifts.push(pendingDrift);}
  }
  for(const event of [pendingPad,pendingItem,pendingDrift])if(event&&value.raceTime-Number(event.time)<Number(event.duration??2.2))event.peakSpeed=Math.max(Number(event.peakSpeed),kart.speed);
  previous=structuredClone(kart);previousTime=value.raceTime;
 });
 await until(()=>world?.players.length===2,'Both drivers in lobby');assert.equal(world!.practice,false);assert.equal(world!.ranked,false);assert.ok(!world!.workshop);assert.equal(world!.trackId,'lagon');
 report.mode={practice:world!.practice,ranked:world!.ranked,workshop:world!.workshop??null,trackId:world!.trackId,players:world!.players.length,eventLevel:world!.eventLevel};
 peer.send('ready',{ready:true});await page.locator('#ready-button').click();await until(()=>page!.locator('#start-button').isEnabled(),'Start enabled');await page.locator('#start-button').click();
 await until(()=>world?.phase==='racing','Normal countdown finished');
 mark('Course normale Île des Alizés, deux pilotes, practice=false et aucun atelier ; départ réel.');
 cdp=await context.newCDPSession(page);
 for(const selector of ['#touch-steer','[data-touch="item"]','[data-touch="drift"]','[data-touch="reset"]']){const box=await page.locator(selector).boundingBox();assert.ok(box,selector);controls.set(selector,box);}
 peerTimer=setInterval(()=>{const kart=world?.players.find(k=>k.id===peer?.sessionId);if(!kart||kart.finished||world?.phase!=='racing')return;if(kart.epoch!==epoch){epoch=kart.epoch;sequence=Math.max(0,kart.lastSeq+1);}peer!.send('input',autopilot(kart,sequence++,true));},1000/30);
 const deadline=Date.now()+150000;let driftStarted=0,resetHeld=false;
 while(world!.phase==='racing'&&Date.now()<deadline){
  const kart=world!.players.find(k=>k.id===hostId)!;if(kart.finished){await release(1);await sleep(150);continue;}
  const input=autopilot(kart,0,false);
  // A single measured drift on a broad curve; steering remains a real thumb gesture.
  if(tryDrift&&!driftAttempted&&pads.length&&kart.boost===0&&kart.speed>20&&Math.abs(input.steer)>.13&&Math.abs(input.steer)<.65&&kart.surface==='road'){driftAttempted=true;driftStarted=world!.raceTime;driftPressed=true;await touch(3,'[data-touch="drift"]');}
  if(driftPressed&&(world!.raceTime-driftStarted>1||kart.driftCharge>.9)){await release(3);driftPressed=false;}
  const steering=input.steer;const axis=Math.abs(steering)<.005?0:Math.sign(steering)*(.1+.9*Math.abs(steering));
  await touch(1,'#touch-steer',.5-.36*axis,input.brake ? .82 : input.throttle>0 ? .18 : .5);
  if(resetHeld){await release(4);resetHeld=false;}else if(input.reset){await touch(4,'[data-touch="reset"]');resetHeld=true;}
  if(itemPressed){await release(2);itemPressed=false;}
  else if(kart.item&&!kart.itemLatch&&kart.boost===0&&kart.stun===0&&kart.surface==='road'&&kart.speed>12&&!input.brake&&Math.abs(input.steer)<.65){await touch(2,'[data-touch="item"]');itemPressed=true;}
  if(!screenshot&&kart.boost>0&&kart.speed>getKartStats(kart.build).speed+2){screenshot=true;report.browserBoost=await page.evaluate(()=>{const d=(window as unknown as {__lagonDebug:{world:World;sessionId:string;predicted:Kart}}).__lagonDebug;const k=d.world.players.find(p=>p.id===d.sessionId)!;return {serverBoost:k.boost,serverSpeed:k.speed,predictedBoost:d.predicted.boost,predictedSpeed:d.predicted.speed,speedText:document.querySelector('#speed')?.textContent,label:document.querySelector('#boost-label')?.textContent};});await capture('boost-in-normal-race.png');}
  if(screenshot&&pads.some(event=>Number(event.peakSpeed)>Number(event.normalLimit)+3)&&(!requireItem||items.some(event=>Number(event.activationBoost)>0&&Number(event.peakSpeed)>Number(event.normalLimit)+3)))break;
  await sleep(45);
 }
 for(const id of [...held.keys()])await release(id);
 report.padEvents=pads;report.itemEvents=items;report.driftEvents=drifts;report.sampleCount=samples.length;report.raceTime=previousTime;
 assert.ok(pads.some(event=>Number(event.activationBoost)>0&&Number(event.peakSpeed)>Number(event.normalLimit)+3),'Track pad must produce a real boost above normal speed');
 mark('Bande turbo : activation serveur et vitesse mesurée supérieure à la limite normale.');
 if(requireItem)assert.ok(items.some(event=>Number(event.activationBoost)>0&&Number(event.peakSpeed)>Number(event.normalLimit)+3),'Naturally collected turbo item must accelerate above normal limit');
 if(items.length)mark('Objet turbo ramassé naturellement et utilisé par le bouton Objet ; mesures consignées.');
 report.itemScope=items.length?'Observed item activations recorded.':'No turbo item was naturally collected and activated in this bounded pad check; no browser item claim.';
 assert.ok(screenshot,'Browser screenshot during real boost');assert.equal((report.browserBoost as {label:string}).label,'TURBO !');assert.deepEqual(errors,[]);passed=true;
} catch(error){report.failure=String(error);console.error(error);process.exitCode=1;}
finally{
 clearInterval(peerTimer);if(page&&!page.isClosed())await page.locator('#leave-button').click({timeout:5000}).catch(()=>{});
 if(peer?.connection.isOpen)await peer.leave().catch(()=>{});await browser?.close();
 report.healthAfter=await api('/healthz').catch(()=>null);Object.assign(report,{passed,checks,errors,padEvents:pads,itemEvents:items,driftEvents:drifts,sampleCount:samples.length,finishedAt:new Date().toISOString(),remaining:['Un seul circuit vérifié dans ce parcours navigateur.','Pas de téléphone physique ni de mesure de fluidité GPU.'],raceTime:previousTime});
 await writeFile(join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'samples.json'),JSON.stringify(samples)+'\n');console.log(JSON.stringify({passed,checks,pads:pads.length,items:items.length,drifts:drifts.length,report:join(output,'validation.json')}));
}
