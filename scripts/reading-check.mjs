import fs from 'node:fs';
import path from 'node:path';
const root=new URL('../public/data/reading/',import.meta.url).pathname;
const files=fs.readdirSync(root).filter(f=>f.endsWith('.json')&&f!=='index.json');
const errors=[]; const seen=new Set(); let passages=0,questions=0;
for(const file of files){
  const data=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  if(!Array.isArray(data)) { errors.push(`${file}: not an array`); continue; }
  for(const p of data){
    passages++;
    if(!p.id||!p.title||!p.passage) errors.push(`${file}: missing passage fields`);
    if(String(p.passage||'').trim().length<200) errors.push(`${file}#${p.id}: passage too short`);
    if(seen.has(p.id)) errors.push(`${file}: duplicate passage id ${p.id}`); else seen.add(p.id);
    if(!Array.isArray(p.questions)||p.questions.length<4||p.questions.length>8) errors.push(`${file}#${p.id}: question count must be 4-8`);
    for(const q of (p.questions||[])){
      questions++;
      if(!q.id||seen.has(q.id)) errors.push(`${file}#${p.id}: duplicate/missing question id ${q.id}`); else seen.add(q.id);
      if(!q.question||!q.explanation) errors.push(`${file}#${p.id}/${q.id}: missing question/explanation`);
      if(!Array.isArray(q.choices)||q.choices.length!==4) errors.push(`${file}#${p.id}/${q.id}: exactly 4 choices required`);
      const cs=(q.choices||[]).map(String);
      if(new Set(cs.map(x=>x.trim().toLowerCase())).size!==4) errors.push(`${file}#${p.id}/${q.id}: duplicate choices`);
      if(!cs.includes(String(q.answer))) errors.push(`${file}#${p.id}/${q.id}: answer not found in choices`);
    }
  }
}
console.log(`Reading checked passages=${passages} questions=${questions} files=${files.length}`);
if(errors.length){for(const e of errors.slice(0,100)) console.error('ERROR',e); process.exit(1);}
console.log('READING PASS: 0 errors');
