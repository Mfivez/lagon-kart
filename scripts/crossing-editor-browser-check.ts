import { homeControl } from './menu-navigation.js';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,type Browser,type Page} from 'playwright';
import {createGameServer} from '../server/app.js';

// The model and all edits are selected through the real editor. This private
// server uses temporary stores and the scenario never publishes a circuit.
const destination=resolve(process.env.REPORT_DIR??'docs/crossings/editor');await mkdir(destination,{recursive:true});
const directory=await mkdtemp(join(tmpdir(),'lagon-crossing-editor-'));
process.env.PLAYER_DATA_DIR=join(directory,'players');process.env.CUSTOM_TRACK_DATA_DIR=join(directory,'tracks');
const {gameServer,httpServer,ready}=createGameServer(resolve('dist/client'));await ready;await gameServer.listen(0,'127.0.0.1');
const address=httpServer.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
const checks:string[]=[],errors:string[]=[],captures:string[]=[],evidence:Record<string,unknown>={origin};let browser:Browser|undefined,passed=false,failure:string|undefined;
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate:()=>Promise<boolean>,label:string,timeout=20_000){const end=Date.now()+timeout;while(!await predicate()){if(Date.now()>end)throw Error(label);await pause(80);}}
async function open(page:Page){page.setDefaultTimeout(30_000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#name-input').waitFor({state:'visible'});}
async function capture(page:Page,name:string){
  const cdp=await page.context().newCDPSession(page);let timer:ReturnType<typeof setTimeout>|undefined;
  try{const value=await Promise.race([cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Capture dépassée : '+name)),30_000);})]);await writeFile(join(destination,name),Buffer.from(value.data,'base64'));captures.push(name);}
  finally{clearTimeout(timer);await cdp.detach();}
}
const signature=(page:Page)=>page.locator('#editor-canvas [data-crossing]').evaluateAll(nodes=>nodes.map(node=>node.innerHTML).join('\n'));
async function point(page:Page,index:number){return page.locator(`#editor-canvas [data-point="${index}"] circle`).first().evaluate(circle=>{const svg=circle.closest('svg')!,p=new DOMPoint(Number(circle.getAttribute('cx')),Number(circle.getAttribute('cy'))).matrixTransform(svg.getScreenCTM()!);return{x:p.x,y:p.y};});}
async function drag(page:Page,touch=false){
  await page.locator('#editor-canvas').scrollIntoViewIfNeeded();const before=await signature(page),from=await point(page,2),to={x:from.x+18,y:from.y+12};
  const cdp=touch?await page.context().newCDPSession(page):undefined;
  try{
    if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:1}]});}
    else{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:6});}
    await until(async()=>(await signature(page))!==before,'Pont recalculé pendant le glissement, avant relâchement');
    const live=await signature(page);assert.notEqual(live,before);evidence[touch?'touchPreview':'mousePreview']={updatedBeforeRelease:true};
  }finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.up();}
  const after=await signature(page);assert.notEqual(after,before);
  await page.locator('#editor-undo').click();assert.equal(await signature(page),before,'Annuler rétablit le pont et son ordre');
  await page.locator('#editor-redo').click();assert.equal(await signature(page),after,'Rétablir restaure le pont recalculé');
}
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const desktop=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1});await desktop.addInitScript(()=>localStorage.setItem('lagon-volume','0'));
  const page=await desktop.newPage();await open(page);await (await homeControl(page, '#name-input')).fill('Ponts atelier');await (await homeControl(page, '#track-editor-button')).click();
  await page.locator('#editor-template').selectOption('figure-eight');await page.locator('#editor-new').click();await page.locator('#editor-canvas').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#editor-canvas [data-crossing]').count(),1);assert.equal(await page.locator('#editor-canvas [data-tunnel]').count(),1);
  assert.equal(await page.locator('#editor-canvas [data-crossing]').getAttribute('data-level'),'1');assert.match(await page.locator('#editor-crossings').innerText(),/Dessus \d+ % · dessous \d+ % · 5 m libres/);
  assert.match(await page.locator('#editor-route-stats').innerText(),/2\s+niveaux/);assert.match(await page.locator('#editor-validation').innerText(),/prête à rouler/);
  evidence.initial={description:await page.locator('#editor-canvas [data-crossing]').getAttribute('aria-label'),summary:await page.locator('#editor-crossings').innerText()};
  await capture(page,'figure-eight-desktop.png');checks.push('Modèle Huit superposé choisi dans l’UI : pont au niveau1, tunnel dessous, 5m de hauteur libre et repères dessus/dessous.');
  await drag(page);checks.push('Glissement souris : aperçu du pont recalculé avant relâchement, Annuler et Rétablir conservent géométrie et ordre.');
  const retained=await signature(page),storageState=await desktop.storageState();await desktop.close();
  const mobile=await browser.newContext({viewport:{width:320,height:568},deviceScaleFactor:1,isMobile:true,hasTouch:true,storageState});
  const phone=await mobile.newPage();await open(phone);await (await homeControl(phone, '#track-editor-button')).click();assert.equal(await phone.locator('#editor-name').inputValue(),'Mon huit superposé');
  assert.equal(await phone.locator('#editor-canvas [data-crossing]').count(),1);assert.ok(retained.length>0);
  assert.equal(await phone.locator('#track-editor-dialog').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
  await drag(phone,true);await phone.locator('#editor-canvas').scrollIntoViewIfNeeded();await capture(phone,'figure-eight-mobile.png');
  await phone.locator('#editor-crossings').scrollIntoViewIfNeeded();await capture(phone,'crossing-details-mobile.png');
  assert.equal(await phone.locator('#editor-crossings').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
  checks.push('Mobile320×568 : brouillon retrouvé, glissement tactile réel, Annuler/Rétablir et explications sans débordement.');
  assert.deepEqual((await fetch(origin+'/api/tracks').then(response=>response.json())as{tracks:unknown[]}).tracks,[]);assert.deepEqual(await readdir(join(directory,'tracks')),[]);
  checks.push('Aucun circuit publié ni fichier de circuit créé ; données temporaires uniquement.');
  assert.deepEqual(errors,[]);passed=true;
}catch(error){failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await gameServer.gracefullyShutdown(false);await rm(directory,{recursive:true,force:true});}
await writeFile(join(destination,'validation.json'),JSON.stringify({passed,timestamp:new Date().toISOString(),checks,errors,captures,evidence,...(failure?{failure}:{}),scope:'Éditeur réel dans Chromium, souris et toucher. Serveur privé, sources dist/client, aucun changement direct du brouillon ou de la simulation.',remaining:['Téléphone physique et Safari iOS non testés.','La conduite sous et sur le pont est couverte par un scénario distinct.']},null,2)+'\n');
console.log(JSON.stringify({passed,checks,captures}));
