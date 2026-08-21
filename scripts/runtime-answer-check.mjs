import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, 'public', 'data');

function norm(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
function choiceText(choice) {
  if (choice == null) return '';
  if (typeof choice === 'string' || typeof choice === 'number') return String(choice).trim();
  return String(choice.text ?? choice.label ?? choice.value ?? '').trim();
}
function canonicalAnswer(choices, answer = '') {
  const explicit = String(answer ?? '').trim();
  const key = norm(explicit);
  if (key) {
    const exact = choices.map(choiceText).find(text => norm(text) === key);
    if (exact) return exact;
  }
  const flagged = choices.find(c => c && typeof c === 'object' && c.correct === true);
  return choiceText(flagged) || explicit;
}
function fillChoices(correct, candidates = [], fallback = [], related = []) {
  const answer = String(correct || '').trim();
  const seen = new Set([norm(answer)]);
  const out = [];
  for (const value of [...candidates, ...fallback]) {
    const text = String(value || '').trim();
    const key = norm(text);
    if (!text || seen.has(key) || related.some(x => norm(x) === key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 3) break;
  }
  return [answer, ...out].slice(0, 4);
}
function normalizeQuestion(q) {
  if (!q || typeof q !== 'object') return null;
  if (q.type === 'vocab') return { ...q, type: 'vocab', word: String(q.word || q.answer || '').trim(), meaning: String(q.meaning || q.answerJa || q.ja || '').trim() };
  if (q.type === 'idiom') {
    const phrase = String(q.phrase || q.word || q.question || '').trim();
    return { ...q, type: 'idiom', word: phrase, phrase };
  }
  return { ...q, choices: Array.isArray(q.choices) ? q.choices : [] };
}
function genericQuestion(q) {
  const raw = Array.isArray(q.choices) ? q.choices : [];
  const choices = raw.map(choiceText).filter(Boolean);
  const answer = canonicalAnswer(raw, q.answer || q.meaning || '');
  return { answer, choices: fillChoices(answer, choices) };
}
function vocabQuestion(q, pool) {
  const current = norm(q.word);
  const others = pool.filter(x => norm(x.word) !== current);
  const samePos = q.pos ? others.filter(x => !x.pos || norm(x.pos) === norm(q.pos)) : others;
  const answer = q.meaning;
  return { answer, choices: fillChoices(answer, samePos.map(x => x.meaning), others.map(x => x.meaning), [q.word]) };
}
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.json') && !entry.name.endsWith('index.json')) out.push(p);
  }
  return out;
}

const pairs = [];
for (const file of walk(dataRoot)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) continue;
  for (const item of data) {
    if (item?.type === 'reading') {
      for (const q of item.questions || []) pairs.push([{ ...q, type: 'reading', level: q.level || item.level }, file]);
    } else {
      pairs.push([normalizeQuestion(item), file]);
    }
  }
}
const vocabPool = pairs.map(([q]) => q).filter(q => q?.type === 'vocab');
const failures = [];
const counts = { total: 0, vocab: 0, idiom: 0, grammarQuiz: 0, reading: 0 };

for (const [q, file] of pairs) {
  if (!q) continue;
  counts.total++;
  let view;
  if (q.type === 'vocab') { counts.vocab++; view = vocabQuestion(q, vocabPool); }
  else if (q.type === 'idiom') { counts.idiom++; view = genericQuestion(q); }
  else if (q.type === 'reading') { counts.reading++; view = { answer: canonicalAnswer(Array.isArray(q.choices) ? q.choices : [], q.answer), choices: Array.isArray(q.choices) ? q.choices : [] }; }
  else if (q.type === 'grammar' && Array.isArray(q.choices)) { counts.grammarQuiz++; view = genericQuestion(q); }
  else continue;

  const answerKey = norm(canonicalAnswer(view.choices, view.answer));
  const selectable = view.choices.filter(choice => norm(choiceText(choice)) === answerKey);
  if (!answerKey || selectable.length !== 1) {
    failures.push(`${path.relative(root, file)}:${q.id || '<no-id>'}: selectable=${selectable.length}, answer=${JSON.stringify(view.answer)}, choices=${JSON.stringify(view.choices)}`);
  }
}

console.log(`runtime-answer-check: ${JSON.stringify({ ...counts, failures: failures.length })}`);
for (const failure of failures.slice(0, 50)) console.error(`- ${failure}`);
if (failures.length) process.exit(1);
console.log('runtime-answer-check: PASS');
