/// <reference lib="dom" />
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=process.cwd();
// Reuse the workspace's pinned browser and Next image processor; no extra runtime dependency.
const requireE2E=createRequire(path.join(root,'e2e/package.json'));
const {chromium}=requireE2E('@playwright/test');
const requireNext=createRequire(createRequire(path.join(root,'apps/web/package.json')).resolve('next/package.json'));
const sharp=requireNext('sharp');
// Run against an isolated tools-dev daemon; these are public reference assets only.
const [origin, guizangShowcase] = process.argv.slice(2);
if (!origin || !guizangShowcase) throw Error('Usage: pnpm exec tsx scripts/bake-native-ppt-previews.ts <daemon-origin> <original-guizang-showcase.png>');
const base=origin+'/api/native-presentation-resources/html-ppt/';
const catalog = await (await fetch(origin+'/api/native-presentation-templates')).json() as { html: string[]; htmlThemes: string[] };
const out=path.join(root,'apps/web/public/presentation-previews');
const manifest:Record<string,Record<string,unknown>>={};
await mkdir(out, { recursive: true });
async function save(buffer:Buffer){
 const meta=await sharp(buffer).metadata();
 const result:any={width:meta.width,height:meta.height};
 for(const [key,width,height,quality] of [['thumb',320,180,75],['full',1280,1280,85]] as const){
  const bytes=await sharp(buffer).resize({width,height,fit:'inside',withoutEnlargement:true}).webp({quality,effort:6}).toBuffer();
  const name=createHash('sha256').update(bytes).digest('hex').slice(0,20)+'.webp';
  await writeFile(path.join(out,name),bytes);result[key]='/presentation-previews/'+name;

 }
 return result;
}
const browser=await chromium.launch({headless:true});
const templates=['recommend','custom',...catalog.html];
let cursor=0;
try {
await Promise.all(Array.from({length:4},async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 while(cursor<templates.length){
  const template=templates[cursor++]!; manifest[template]={};
  const portrait=template==='xhs-post';
  await page.setViewportSize(portrait?{width:810,height:1080}:{width:1280,height:720});
  const resource=template==='recommend'?'templates/full-decks-index.html':template==='custom'?'templates/deck.html':`templates/full-decks/${template}/index.html`;
  const response=await page.goto(base+resource+'?preview=1',{waitUntil:'networkidle',timeout:60000});
  if(!response?.ok())throw Error('Resource failed '+resource);
  await page.evaluate(()=>document.fonts.ready);
  const themes=template==='recommend'?['']:['',...catalog.htmlThemes];
  for(const theme of themes){
   if(theme){
    await page.evaluate(async({base,theme}: {base:string;theme:string})=>{
     let link=document.getElementById('theme-link') as HTMLLinkElement|null;
     if(!link){link=document.createElement('link');link.id='theme-link';link.rel='stylesheet';document.head.appendChild(link);}
     await new Promise<void>((resolve,reject)=>{link!.onload=()=>resolve();link!.onerror=()=>reject(Error('theme failed'));link!.href=base+'assets/themes/'+theme+'.css';});
     document.documentElement.setAttribute('data-theme',theme);await document.fonts.ready;
    },{base,theme});
   }
   const image=await page.screenshot({animations:'disabled'});
   manifest[template]![theme||'default']=await save(image);
  }
  console.log('Rendered',template);
 }
 await page.close();
}));
} finally {
  await browser.close();
}
manifest.guizang={default:await save(await readFile(guizangShowcase))};
await writeFile(path.join(root,'apps/web/src/poster/native-preview-assets.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Wrote the preview catalog. Remove unreferenced WebP files before committing; the asset test checks this.');
