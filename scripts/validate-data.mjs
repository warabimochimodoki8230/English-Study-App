import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../public/data/', import.meta.url).pathname;
const errors = [];
const warnings = [];
const seenIds = new Map();
const seenWords = new Map();
let totals = { files: 0, records: 0, vocab: 0, quiz: 0, readingPassages: 0, readingQuestions: 0 };

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : p.endsWith('.json') && !e.name.endsWith('index.json') ? [p] : [];
  });
}
function arr(v) { return Array.isArray(v) ? v : []; }
function norm(v) { return String(v ?? '').trim(); }

for (const file of files(root)) {
  totals.files++;
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { errors.push(`${file}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(data)) continue;
  data.forEach((q, i) => {
    totals.records++;
    if (!q || typeof q !== 'object') { errors.push(`${file}#${i}: record is not an object`); return; }
    if (!norm(q.id)) errors.push(`${file}#${i}: missing id`);
    else if (seenIds.has(q.id)) errors.push(`${file}#${i}: duplicate id ${q.id} (also ${seenIds.get(q.id)})`);
    else seenIds.set(q.id, `${file}#${i}`);


    if (q.type === 'reading') {
      totals.readingPassages++;
      if (!norm(q.level)) errors.push(`${file}#${i}: reading missing level`);
      if (!norm(q.title)) errors.push(`${file}#${i}: reading missing title`);
      if (!norm(q.passage) || norm(q.passage).length < 200) errors.push(`${file}#${i}: reading passage too short`);
      if (!Array.isArray(q.questions) || !q.questions.length) errors.push(`${file}#${i}: reading missing questions`);
      else q.questions.forEach((rq, j) => {
        totals.readingQuestions++;
        if (!norm(rq.id)) errors.push(`${file}#${i} question ${j}: missing id`);
        else if (seenIds.has(rq.id)) errors.push(`${file}#${i} question ${j}: duplicate id ${rq.id}`);
        else seenIds.set(rq.id, `${file}#${i} question ${j}`);
        if (!norm(rq.question)) errors.push(`${file}#${i} question ${j}: missing question`);
        if (!Array.isArray(rq.choices) || rq.choices.length !== 4) errors.push(`${file}#${i} question ${j}: reading choices must be exactly 4`);
        else {
          const labels=rq.choices.map(norm);
          if (new Set(labels.map(x=>x.toLowerCase())).size!==4) errors.push(`${file}#${i} question ${j}: duplicate reading choices`);
          if (!labels.includes(norm(rq.answer))) errors.push(`${file}#${i} question ${j}: answer not found in choices`);
        }
        if (!norm(rq.explanation)) errors.push(`${file}#${i} question ${j}: missing explanation`);
      });
      return;
    }

    if (q.type === 'vocab' || q.word) {
      totals.vocab++;
      const word = norm(q.word).toLowerCase();
      const meaning = norm(q.meaning || q.answerJa || q.ja || q.answer);
      if (!word) errors.push(`${file}#${i}: vocab missing word`);
      if (!meaning) errors.push(`${file}#${i}: vocab missing meaning`);
      const key = `${word}::${norm(q.pos).toLowerCase()}`;
      if (seenWords.has(key)) warnings.push(`${file}#${i}: repeated headword/pos ${word} (also ${seenWords.get(key)})`);
      else seenWords.set(key, `${file}#${i}`);
      if (q.exampleSentence && !norm(q.exampleSentence)) warnings.push(`${file}#${i}: blank exampleSentence`);
      if (q.synonyms && !Array.isArray(q.synonyms)) errors.push(`${file}#${i}: synonyms must be array`);
      if (q.family && typeof q.family !== 'string') errors.push(`${file}#${i}: family must be string`);
      return;
    }

    const isQuizRecord = path.basename(file).toLowerCase().startsWith('quiz-') || q.type === 'quiz' || q.kind === 'quiz';
    if (isQuizRecord && Array.isArray(q.choices)) {
      totals.quiz++;
      const labels = q.choices.map(c => typeof c === 'string' ? c : c?.text).map(norm).filter(Boolean);
      if (labels.length < 2) errors.push(`${file}#${i}: fewer than 2 choices`);
      if (new Set(labels.map(x => x.toLowerCase())).size !== labels.length) errors.push(`${file}#${i}: duplicate choices`);
      const marked = q.choices.filter(c => c && typeof c === 'object' && c.correct === true).length;
      if (marked > 0 && marked !== 1) errors.push(`${file}#${i}: correct flags must mark exactly one choice`);
      if (q.answer && labels.length && !labels.includes(norm(q.answer))) warnings.push(`${file}#${i}: answer not found in choices`);
    }
  });
}

console.log(`Validated files=${totals.files} records=${totals.records} vocab=${totals.vocab} choice_records=${totals.quiz} reading_passages=${totals.readingPassages} reading_questions=${totals.readingQuestions}`);
for (const w of warnings.slice(0, 50)) console.warn('WARN', w);
if (warnings.length > 50) console.warn(`WARN ... and ${warnings.length - 50} more`);
if (errors.length) {
  for (const e of errors) console.error('ERROR', e);
  process.exit(1);
}
console.log(`PASS: ${errors.length} errors, ${warnings.length} warnings`);
