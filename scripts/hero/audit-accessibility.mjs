import {writeFile,mkdir} from 'node:fs/promises';
import axe from 'axe-core';
import puppeteer from 'puppeteer-core';
const before=process.argv.includes('--before');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out='/private/tmp/latentsig-accessibility';await mkdir(out,{recursive:true});
const report={viewports:[],errors:[]};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const [width,height] of [[1440,960],[320,740],[390,844],[768,1024],[1024,768],[667,375]]){
  await page.setViewport({width,height,deviceScaleFactor:1});await page.goto('http://127.0.0.1:4321/',{waitUntil:'networkidle0'});
  await page.addScriptTag({content:axe.source});
  const scan=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))}});
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,overflowElements:[...document.querySelectorAll('main *,nav *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='absolute').slice(0,10).map(e=>({tag:e.tagName,class:e.className})),pause:document.querySelector('.hero-motion')?.getBoundingClientRect().toJSON(),menu:document.querySelector('#mobile-menu-toggle')?.getBoundingClientRect().toJSON()}));
  report.viewports.push({width,height,...scan,...layout});await page.screenshot({path:`${out}/${before?'before':'after'}-${width}.png`});
 }
 report.passed=report.errors.length===0&&report.viewports.every(v=>!v.overflow&&v.violations.length===0);
 await writeFile(`docs/reviews/accessibility-${before?'before':'after'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!before&&!report.passed)process.exitCode=1;
}finally{await browser.close()}
