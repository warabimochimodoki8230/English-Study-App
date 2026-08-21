import fs from 'node:fs'; import path from 'node:path';
const root=new URL('../public/data/grammar/',import.meta.url).pathname;
const files=fs.readdirSync(root).filter(f=>f.startsWith('quiz-')&&f.endsWith('.json'));
const ids=new Set(); const stems=new Set(); let total=0, exactDup=0, errors=[];
for(const file of files){const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')); if(!Array.isArray(data)){errors.push(`${file}: not array`);continue;}
 for(const q of data){total++; if(!q.id||ids.has(q.id)) errors.push(`${file}: duplicate/missing id ${q.id}`); else ids.add(q.id); if(!q.question||!q.answer||!q.explanation) errors.push(`${file}#${q.id}: missing fields`); if(!Array.isArray(q.choices)||q.choices.length!==4) errors.push(`${file}#${q.id}: choices != 4`); else {const c=q.choices.map(x=>typeof x==='string'?x:x?.text); if(new Set(c.map(x=>String(x).toLowerCase())).size!==4) errors.push(`${file}#${q.id}: duplicate choices`); const marked=q.choices.filter(x=>x&&typeof x==='object'&&x.correct===true); if(marked.length!==1) errors.push(`${file}#${q.id}: correct flag count ${marked.length}`); if(String(marked[0]?.text)!==String(q.answer)) errors.push(`${file}#${q.id}: answer mismatch`);} const sig=String(q.question).trim().toLowerCase()+'||'+String(q.answer).trim().toLowerCase(); if(stems.has(sig)) exactDup++; else stems.add(sig); }
}
console.log(`Grammar checked=${total} files=${files.length} exact_duplicate_stems=${exactDup}`);
if(errors.length){for(const e of errors.slice(0,100)) console.error('ERROR',e); process.exit(1);}
if(exactDup>0) console.warn(`GRAMMAR NOTE: ${exactDup} duplicate question stems across the full legacy+new corpus; IDs and answer structures remain valid.`); console.log('GRAMMAR PASS: 0 structural errors');
