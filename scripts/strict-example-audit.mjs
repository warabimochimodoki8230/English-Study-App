import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../public/data/vocab/', import.meta.url);
const idiomRoot = new URL('../public/data/idioms/', import.meta.url);
const closed = new Set(`a an the this that these those it its itself he him his she her hers we us our ours you your yours i me my mine they them their theirs who whom whose which what whatever whoever where when why how in on at by for from of to with without within under over above below into onto upon about against among between through during despite toward towards before after since until as like than per via and or but nor yet so if unless while although though because whether either neither both all each every another other any some no none much many more most few fewer less least enough several such same be am is are was were been being have has had having do does did doing done can could may might must shall should will would ought need`.split(/\s+/));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.json')&&e.name!=='index.json').map(e=>path.join(dir,e.name));}
let errors=[]; let vocab=[]; let idioms=[];
for(const f of files(root.pathname)){const d=JSON.parse(fs.readFileSync(f,'utf8')); vocab.push(...(Array.isArray(d)?d:(d.items||d.data||[])));}
for(const f of files(idiomRoot.pathname)){const d=JSON.parse(fs.readFileSync(f,'utf8')); idioms.push(...(Array.isArray(d)?d:(d.items||d.data||[])));}
const ev=new Set();
for(const x of vocab){ const w=String(x.word||'').toLowerCase(); const p=String(x.pos||'').toLowerCase(); if(closed.has(w)||['prep','pron','conj','det','interj','article'].includes(p)) errors.push(`closed-class vocab: ${x.word}`); if(ev.has(x.exampleSentence)) errors.push(`duplicate vocab example: ${x.word}`); ev.add(x.exampleSentence); if((x.exampleSentence||'').trim().split(/[.!?]/).filter(Boolean).length!==1) errors.push(`multi-sentence vocab example: ${x.word}`); }
const ei=new Set(); for(const x of idioms){ if(ei.has(x.exampleSentence)) errors.push(`duplicate idiom example: ${x.word||x.phrase}`); ei.add(x.exampleSentence); if((x.exampleSentence||'').trim().split(/[.!?]/).filter(Boolean).length!==1) errors.push(`multi-sentence idiom example: ${x.word||x.phrase}`); }
console.log(`STRICT: vocab=${vocab.length}, idioms=${idioms.length}, errors=${errors.length}`); if(errors.length){console.log(errors.slice(0,50).join('\n'));process.exit(1)}
