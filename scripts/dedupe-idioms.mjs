import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(new URL('../public/data/idioms/', import.meta.url).pathname);
const files=fs.readdirSync(ROOT).filter(f=>f.endsWith('.json')&&f!=='index.json');
const levelRank={basic:1,standard:2,entrance:3,hard:4};
const norm=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
const rich=q=>{
  let n=0; for(const k of ['exampleSentence','exampleJa','note','tags','collocations']){const v=q[k];n+=Array.isArray(v)?v.length*2:(String(v??'').trim()?2:0)}
  if(Array.isArray(q.choices)&&q.choices.length>=4)n+=3; return n;
};
const map=new Map();
for(const file of files){
 const arr=JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
 for(const q of arr){
  const key=norm(q.word)+'::'+norm(q.pos);
  const p=map.get(key);
  if(!p){map.set(key,{q,files:[file]}); continue;}
  p.files.push(file);
  const winner=rich(q)>rich(p.q)?q:p.q;
  const loser=winner===q?p.q:q;
  p.q={...loser,...winner};
  const a=Array.isArray(p.q.tags)?p.q.tags:[]; p.q.tags=[...new Set(a)];
  const ranks=[p.q.level, loser.level].map(x=>levelRank[x]||99); const min=Math.min(...ranks); p.q.level=Object.keys(levelRank).find(k=>levelRank[k]===min)||p.q.level;
  p.q.levelTags=[...new Set([...(p.q.levelTags||[]),...(p.files.map(f=>f.match(/(basic|standard|entrance|hard)/)?.[1]||'' ).filter(Boolean))])];
 }
}
for(const file of files) fs.rmSync(path.join(ROOT,file));
const buckets={basic:[],standard:[],entrance:[],hard:[]};
for(const {q} of map.values()) buckets[q.level]?.push(q);
for(const [level,arr] of Object.entries(buckets)){
 arr.sort((a,b)=>norm(a.word).localeCompare(norm(b.word)));
 for(let i=0;i<arr.length;i+=80) fs.writeFileSync(path.join(ROOT,`${level}-${String(Math.floor(i/80)+1).padStart(2,'0')}.json`),JSON.stringify(arr.slice(i,i+80),null,2)+'\n');
}
const index={version:'2026.08.21-idiom-db-v1',kind:'idioms',total:Object.values(buckets).reduce((a,b)=>a+b.length,0),levels:{}};
for(const level of Object.keys(buckets)) index.levels[level]={count:buckets[level].length,files:fs.readdirSync(ROOT).filter(f=>f.startsWith(level+'-')&&f.endsWith('.json')).sort()};
fs.writeFileSync(path.join(ROOT,'index.json'),JSON.stringify(index,null,2)+'\n');
console.log(index);
