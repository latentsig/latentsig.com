import { writeFile, mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true, args:['--enable-webgl','--ignore-gpu-blocklist'] });
try {
 const page = await browser.newPage(); await page.setViewport({width:1440,height:960,deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.querySelector('latentsig-hero-scene')?.heroDebug,{timeout:45000});
 const image=await page.evaluate(()=>{const root=document.querySelector('latentsig-hero-scene');root.heroDebug.seek(0);return root.heroDebug.snapshot()});
 await writeFile('public/3d/hero/observatory.webp',Buffer.from(image.split(',')[1],'base64'));
 await mkdir('/private/tmp/latentsig-hero-checks',{recursive:true});
 await page.screenshot({path:'/private/tmp/latentsig-hero-checks/desktop.png'});
 const mobile = await browser.newPage(); await mobile.setViewport({width:390,height:844,deviceScaleFactor:1});
 await mobile.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});
 await mobile.$eval('.hero-visual',e=>e.scrollIntoView({behavior:'instant'}));
 await mobile.waitForFunction(()=>document.querySelector('latentsig-hero-scene')?.heroDebug,{timeout:45000});
 const mobileImage = await mobile.evaluate(()=>{const root=document.querySelector('latentsig-hero-scene');root.heroDebug.seek(0);return root.heroDebug.snapshot()});
 await writeFile('public/3d/hero/observatory-mobile.webp',Buffer.from(mobileImage.split(',')[1],'base64'));
 console.log(JSON.stringify({stats:await page.evaluate(()=>document.querySelector('latentsig-hero-scene').heroDebug.stats()),errors},null,2));
} finally { await browser.close(); }
