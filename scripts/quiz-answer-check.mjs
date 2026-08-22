import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [
  path.join(root, 'public/data/grammar'),
  path.join(root, 'public/data/reading')
];

function normalizeText(text) {
  return String(text ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}
function choiceText(choice) {
  if (choice == null) return '';
  if (typeof choice === 'string' || typeof choice === 'number') return String(choice).trim();
  return String(choice.text ?? choice.label ?? choice.value ?? '').trim();
}
function canonicalAnswer(choices, answer = '') {
  const explicit = String(answer ?? '').trim();
  const key = normalizeText(explicit);
  if (key) {
    const match = choices.map(choiceText).find(text => normalizeText(text) === key);
    if (match) return match;
  }
  const flagged = choices.find(c => c && typeof c === 'object' && c.correct === true);
  return choiceText(flagged) || explicit;
}

let checked = 0;
let failures = [];
function checkQuestion(q, file) {
  const rawChoices = Array.isArray(q.choices) ? q.choices : [];
  const answer = canonicalAnswer(rawChoices, q.answer);
  const texts = rawChoices.map(choiceText).filter(Boolean);
  checked++;
  if (!answer) failures.push(`${file}:${q.id ?? '<no-id>'}: answer is empty`);
  else if (!texts.some(t => normalizeText(t) === normalizeText(answer))) failures.push(`${file}:${q.id ?? '<no-id>'}: answer is not selectable: ${answer}`);
}

for (const dir of dirs) {
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const file = path.join(dir, name);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (dir.endsWith('/reading')) {
      for (const passage of Array.isArray(data) ? data : []) {
        for (const q of passage.questions ?? []) checkQuestion(q, path.relative(root, file));
      }
    } else {
      for (const q of Array.isArray(data) ? data : []) checkQuestion(q, path.relative(root, file));
    }
  }
}

if (failures.length) {
  console.error(`quiz-answer-check: ${failures.length} failure(s) / ${checked} question(s)`);
  for (const f of failures.slice(0, 50)) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`quiz-answer-check: OK (${checked} question(s))`);
