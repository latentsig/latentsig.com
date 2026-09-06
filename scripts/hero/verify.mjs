import { writeFile,mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out='/private/tmp/latentsig-hero-checks';await mkdir(out,{recursive:true});
const report={};const errors=[];
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:960,deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('latentsig-hero-scene')?.heroDebug,{timeout:45000});
 const stats=()=>page.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.stats());
 await wait(3000);const a=await stats();await wait(5000);const b=await stats();
 report.desktop={...b,observedFps:Number(((b.frames-a.frames)/5).toFixed(1)),steadySubmissionMs:Number(((b.totalSubmissionMs-a.totalSubmissionMs)/(b.frames-a.frames)).toFixed(2))};report.autoplays=b.time>a.time;
 report.noFilmControl=await page.evaluate(()=>!document.body.textContent.includes('Play the film')&&!document.querySelector('audio,iframe'));
 await page.click('.hero-motion');await wait(100);const pausedA=await stats();await wait(500);const pausedB=await stats();report.pause=pausedA.frames===pausedB.frames;await page.click('.hero-motion');await wait(400);report.resume=(await stats()).frames>pausedB.frames;
 await page.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.seek(59.95));await wait(500);const loop=await stats();report.loopContinues=loop.time<1&&loop.time>0;
 await page.screenshot({path:out+'/desktop.png'});
 await page.click('.hero-motion');
 report.chapters=[];
 for(const [t,chapter,name] of [[6,0,'signal'],[19,1,'research'],[32,2,'architecture'],[45,3,'deployment']]){
   await page.evaluate(t=>document.querySelector('latentsig-hero-scene').heroDebug.seek(t),t);
   await wait(100);
   const state=await stats();
   const overlay=await page.$eval(`[data-story="${chapter}"]`,e=>({opacity:getComputedStyle(e).opacity,title:e.querySelector('h2').textContent,hiddenFromReader:Boolean(e.closest('[aria-hidden="true"]'))}));
   if(chapter===2) report.layerLabels=await page.$$eval('[data-layer-label]',els=>els.map(e=>({text:e.textContent,visible:getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity==='1'})));
   report.chapters.push({time:t,chapter:state.chapter,camera:state.camera,target:state.target,drawCalls:state.drawCalls,mechanisms:state.mechanisms,overlay,passed:state.chapter===chapter&&overlay.opacity==='1'&&overlay.hiddenFromReader});
   await page.screenshot({path:out+'/'+name+'.png'});
 }
 report.mechanismsUnfold=report.chapters[1].mechanisms.researchReveal>.95&&report.chapters[2].mechanisms.architectureReveal>.95&&report.chapters[3].mechanisms.deploymentReveal>.95;
 await page.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.seek(56));
 report.mechanismsReassemble=Object.values((await stats()).mechanisms).every(v=>v===0);
 report.cameraTravel=Math.hypot(...report.chapters[1].camera.map((v,i)=>v-report.chapters[2].camera[i]))>8;
 await page.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.seek(0));
 await page.click('.hero-motion');

 await page.evaluate(()=>window.scrollTo({top:1600,behavior:'instant'}));await wait(400);const offA=await stats();await wait(700);const offB=await stats();report.offscreenSuspends=!offB.active&&offA.frames===offB.frames;
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await wait(500);report.returnsToAnimation=(await stats()).active;
 // Exercise the same visibility event used by browsers, without headless foreground-policy ambiguity.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await wait(100);const hiddenA=await stats();await wait(600);const hiddenB=await stats();report.hiddenSuspends=!hiddenB.active&&hiddenA.frames===hiddenB.frames;
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await wait(300);
 report.navLinks=await page.$$eval('nav a[href]',nodes=>[...new Set(nodes.map(a=>a.getAttribute('href')))]);
 const mobile=await browser.newPage();await mobile.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});await mobile.waitForFunction(()=>document.querySelector('latentsig-hero-scene')?.heroDebug,{timeout:45000});await wait(1000);
 report.mobile=await mobile.evaluate(()=>({...document.querySelector('latentsig-hero-scene').heroDebug.stats(),overflow:document.documentElement.scrollWidth>innerWidth}));
 await mobile.click('#mobile-menu-toggle');report.mobileMenu=await mobile.$eval('#mobile-menu',e=>!e.classList.contains('hidden'));await mobile.click('#mobile-menu-toggle');await mobile.screenshot({path:out+'/mobile.png',fullPage:false});
 await mobile.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.seek(19));
 await mobile.mouse.wheel({deltaY:420});await wait(300);await mobile.screenshot({path:out+'/mobile-scene.png'});
 const reduced=await browser.newPage();await reduced.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);let reducedModel=false;reduced.on('request',r=>{if(r.url().endsWith('.glb'))reducedModel=true});await reduced.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});await wait(500);report.reducedMotion={modelRequested:reducedModel,canvas:await reduced.$eval('latentsig-hero-scene',e=>Boolean(e.querySelector('canvas'))),posterLoaded:await reduced.$eval('.hero-poster',e=>e.complete&&e.naturalWidth>0)};
 const saved=await browser.newPage();await saved.evaluateOnNewDocument(()=>{Object.defineProperty(navigator,'connection',{value:{saveData:true,addEventListener(){},removeEventListener(){}}})});let savedModel=false;saved.on('request',r=>{if(r.url().endsWith('.glb'))savedModel=true});await saved.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});await wait(300);report.saveData={modelRequested:savedModel,canvas:await saved.$eval('latentsig-hero-scene',e=>Boolean(e.querySelector('canvas')))};
 await page.bringToFront();await page.waitForFunction(()=>document.querySelector('.hero-canvas canvas'));await page.evaluate(()=>{const canvas=document.querySelector('.hero-canvas canvas');canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()});await wait(200);report.contextLoss=await page.$eval('latentsig-hero-scene',e=>e.dataset.state==='fallback'&&e.querySelector('.hero-poster').complete);
 report.preserved=await page.evaluate(()=>({
   navigationDestinations:JSON.stringify([...new Set([...document.querySelectorAll('nav a[href]')].map(a=>a.getAttribute('href')))])===JSON.stringify(['/','/rd-advisory/','/implementation/','/consulting/','/insights/','/about/','https://calendly.com/latentsig']),
   footerDestinations:['/rd-advisory/','/implementation/','/consulting/','/about/','/insights/','/contact/','/privacy/','/terms/'].every(h=>document.querySelector(`footer a[href="${h}"]`)),
   sectionHeadings:['Precision AI Services','Engineered for Reliability','Ready to unlock your technical latent potential?'].every(t=>[...document.querySelectorAll('main > section:not(.observatory-hero) h2')].some(h=>h.textContent.trim()===t))
 }));
 report.errors=errors;
 report.passed=report.layerLabels.length===3&&report.layerLabels.every(l=>l.visible)&&report.mechanismsUnfold&&report.mechanismsReassemble&&report.chapters.every(c=>c.passed)&&report.cameraTravel&&report.autoplays&&report.noFilmControl&&report.pause&&report.resume&&report.loopContinues&&report.offscreenSuspends&&report.hiddenSuspends&&report.returnsToAnimation&&report.mobileMenu&&!report.mobile.overflow&&!report.reducedMotion.modelRequested&&!report.reducedMotion.canvas&&report.reducedMotion.posterLoaded&&!report.saveData.modelRequested&&!report.saveData.canvas&&report.contextLoss&&Object.values(report.preserved).every(Boolean)&&errors.length===0;
 await writeFile('scripts/hero/validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{await browser.close()}
