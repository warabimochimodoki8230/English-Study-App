import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../public/data/vocab/', import.meta.url).pathname);
const LEVEL_ORDER = ['basic','standard','developed','advanced','hard'];
const POS = s => {
  const x = String(s ?? '').trim().toLowerCase();
  if (!x) return '';
  if (/^(n|noun)/.test(x)) return 'n';
  if (/^(v|verb)/.test(x)) return 'v';
  if (/^(adj|adjective)/.test(x)) return 'adj';
  if (/^(adv|adverb)/.test(x)) return 'adv';
  if (/^(prep|preposition)/.test(x)) return 'prep';
  if (/^(conj|conjunction)/.test(x)) return 'conj';
  if (/^(pron|pronoun)/.test(x)) return 'pron';
  if (/^(det|determiner)/.test(x)) return 'det';
  return x;
};
const normWord = s => String(s ?? '').trim().toLowerCase().replace(/[’']/g,"'");
const richness = q => {
  let n = 0;
  for (const k of ['exampleSentence','exampleJa','definitionEn','definition','family','synonyms','antonyms','collocations','tags','note']) {
    const v = q[k];
    if (Array.isArray(v)) n += v.length ? 2 : 0;
    else if (String(v ?? '').trim()) n += String(v).length > 20 ? 2 : 1;
  }
  if (Array.isArray(q.choices) && q.choices.length >= 4) n += 3;
  if (String(q.meaning ?? '').split(/[・、,;；]/).filter(Boolean).length >= 2) n += 1;
  return n;
};
const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.json') && f !== 'index.json');
const records = [];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
  if (!Array.isArray(data)) continue;
  for (const q of data) if (q?.word) records.push({file,q});
}
const merged = new Map();
const dupStats = [];
for (const {file,q} of records) {
  const key = `${normWord(q.word)}::${POS(q.pos)}`;
  const level = LEVEL_ORDER.includes(q.level) ? q.level : 'standard';
  const prev = merged.get(key);
  if (!prev) {
    merged.set(key, {q:{...q, level, pos: POS(q.pos) || q.pos}, files:[file], levels:new Set([level])});
    continue;
  }
  prev.files.push(file); prev.levels.add(level);
  const winner = richness(q) > richness(prev.q) ? q : prev.q;
  const loser = winner === q ? prev.q : q;
  const combined = {...loser, ...winner};
  if (Array.isArray(prev.q.tags) || Array.isArray(q.tags)) combined.tags = [...new Set([...(prev.q.tags||[]), ...(q.tags||[])])];
  if (Array.isArray(prev.q.synonyms) || Array.isArray(q.synonyms)) combined.synonyms = [...new Set([...(prev.q.synonyms||[]), ...(q.synonyms||[])])].filter(Boolean);
  if (Array.isArray(prev.q.antonyms) || Array.isArray(q.antonyms)) combined.antonyms = [...new Set([...(prev.q.antonyms||[]), ...(q.antonyms||[])])].filter(Boolean);
  if (Array.isArray(prev.q.collocations) || Array.isArray(q.collocations)) combined.collocations = [...new Set([...(prev.q.collocations||[]), ...(q.collocations||[])])].filter(Boolean);
  const chosenLevel = LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(prev.q.level), LEVEL_ORDER.indexOf(level))];
  combined.level = chosenLevel;
  combined.levelTags = LEVEL_ORDER.filter(l => prev.levels.has(l) || l === level);
  prev.q = combined;
  prev.levels.add(chosenLevel);
}

// Add curated expansion.
const addFile = path.resolve(new URL('../ADD_ALL.tsv', import.meta.url).pathname);
if (fs.existsSync(addFile)) {
  const lines = fs.readFileSync(addFile,'utf8').split(/\r?\n/).filter(Boolean);
  let seq = 1;
  for (const line of lines) {
    const parts = line.split('\t');
    const word = parts[0];
    const meaning = parts[1];
    const pos = parts.length >= 4 ? parts[parts.length - 2] : parts[2];
    const level = parts[parts.length - 1];
    if (!word || !meaning || !pos || !LEVEL_ORDER.includes(level)) continue;
    const key = `${normWord(word)}::${POS(pos)}`;
    const entry = {
      id: `v-curated-${String(seq++).padStart(4,'0')}`,
      type:'vocab', level, word:word.trim(), meaning:meaning.trim(), pos:POS(pos),
      question:word.trim(), prompt:'最も近い日本語の意味を選べ。',
      answer:meaning.trim(), explanation:`${word.trim()} = ${meaning.trim()}。`,
      tags:['curated-expansion-2026'], source:'curated-entrance-expansion-v1'
    };
    const prev = merged.get(key);
    if (!prev) merged.set(key,{q:entry,files:['ADD_ALL.tsv'],levels:new Set([level])});
    else {
      prev.files.push('ADD_ALL.tsv'); prev.levels.add(level);
      const chosen = LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(prev.q.level), LEVEL_ORDER.indexOf(level))];
      prev.q.level = chosen;
      prev.q.levelTags = LEVEL_ORDER.filter(l => prev.levels.has(l));
    }
  }
}

// Clear vocab json files, then bucket canonical records into stable shards.
for (const file of files) fs.rmSync(path.join(ROOT,file));
const buckets = new Map(LEVEL_ORDER.map(l => [l, []]));
for (const {q} of merged.values()) buckets.get(q.level).push(q);
const byLevel = Object.fromEntries(LEVEL_ORDER.map(l => [l, buckets.get(l).sort((a,b)=>normWord(a.word).localeCompare(normWord(b.word)))]));
const shardSize = 300;
for (const level of LEVEL_ORDER) {
  const arr = byLevel[level];
  for (let i=0; i<arr.length; i+=shardSize) {
    const shard = arr.slice(i,i+shardSize);
    const name = `${level}-${String(Math.floor(i/shardSize)+1).padStart(2,'0')}.json`;
    fs.writeFileSync(path.join(ROOT,name), JSON.stringify(shard,null,2)+'\n');
  }
}
const counts = Object.fromEntries(LEVEL_ORDER.map(l => [l, byLevel[l].length]));
const index = {
  version:'2026.08.21-vocab-db-v1', kind:'vocab',
  total: Object.values(counts).reduce((a,b)=>a+b,0), levels:{},
  schema:{required:['id','type','level','word','meaning'], recommended:['pos','exampleSentence','exampleJa','family','synonyms','antonyms','collocations','tags','source']},
  quality_notes:[
    'Canonical headwords are globally deduplicated by normalized headword + part of speech.',
    'When duplicates existed, the most information-rich record was retained and metadata arrays were merged.',
    'Difficulty level is the easiest level at which the word is tagged; original overlapping levels are retained in levelTags.',
    'Curated expansion entries are original additions and are not copied from proprietary exam-prep books.'
  ],
  attribution:{
    ngsl:'New General Service List by Browne, C., Culligan, B., and Phillips, J. Licensed under CC BY-SA 4.0.',
    note:'Additional curated entries are original database content for this application.'
  }
};
for (const level of LEVEL_ORDER) {
  const filesFor = fs.readdirSync(ROOT).filter(f => f.startsWith(level+'-') && f.endsWith('.json')).sort();
  index.levels[level]={count:counts[level], files:filesFor};
}
fs.writeFileSync(path.join(ROOT,'index.json'), JSON.stringify(index,null,2)+'\n');
fs.writeFileSync(path.join(path.dirname(ROOT),'database-manifest.json'), JSON.stringify({generated:'2026-08-21',total:index.total,counts,source:'curated-entrance-expansion-v1 + existing validated database',deduped:true},null,2)+'\n');
console.log(JSON.stringify({total:index.total,counts},null,2));
