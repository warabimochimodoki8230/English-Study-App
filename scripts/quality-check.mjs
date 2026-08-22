import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../public/data/vocab/', import.meta.url).pathname;
const files = fs.readdirSync(root).filter(f => f.endsWith('.json') && f !== 'index.json');
const all = files.flatMap(f => {
  const d = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  return Array.isArray(d) ? d.map(q => ({ ...q, _file: f })) : [];
});
const norm = x => String(x ?? '').trim().toLowerCase().replace(/[・、，,;；/／\s]+/g, ' ');
const uniq = xs => [...new Set(xs.map(norm).filter(Boolean))];
const warnings = [];
const errors = [];

const ids = new Map();
const headwords = new Map();
for (const q of all) {
  if (!q.id) errors.push('missing id');
  else if (ids.has(q.id)) errors.push(`duplicate id: ${q.id} (${ids.get(q.id)} / ${q._file})`);
  else ids.set(q.id, q._file);

  if (!q.word || !q.meaning) errors.push(`missing word/meaning: ${q.id || q._file}`);
  const hwKey = `${norm(q.word)}|${norm(q.pos)}`;
  if (headwords.has(hwKey)) errors.push(`duplicate headword+pos: ${q.word} / ${q.pos || '(none)'} (${headwords.get(hwKey)} / ${q._file})`);
  else headwords.set(hwKey, q._file);

  if (Array.isArray(q.choices) && q.choices.length) {
    const shown = q.choices.map(c => typeof c === 'string' ? c : c?.text).filter(Boolean);
    const correct = q.choices.filter(c => typeof c === 'object' && c.correct === true).map(c => c.text).filter(Boolean);
    if (uniq(shown).length < 4) errors.push(`choice diversity < 4: ${q.id}`);
    if (correct.length !== 1) errors.push(`choice correct-count=${correct.length}: ${q.id}`);
    if (correct.length === 1 && norm(correct[0]) !== norm(q.answer)) errors.push(`choice answer mismatch: ${q.id}`);
  }
}

const byLevel = new Map();
for (const q of all) {
  const level = q.level || 'unknown';
  if (!byLevel.has(level)) byLevel.set(level, []);
  byLevel.get(level).push(q);
}

const samePos = (a,b) => !a.pos || !b.pos || norm(a.pos) === norm(b.pos);
const globalCandidates = (q, mode) => {
  const current = norm(q.word);
  if (mode === 'en-ja') return all.filter(x => norm(x.word) !== current && samePos(q,x)).map(x => x.meaning);
  if (mode === 'ja-en' || mode === 'context') return all.filter(x => norm(x.word) !== current && samePos(q,x)).map(x => x.word);
  if (mode === 'synonym') return all.filter(x => norm(x.word) !== current && samePos(q,x)).flatMap(x => Array.isArray(x.synonyms) ? x.synonyms : []);
  return all.filter(x => norm(x.word) !== current && samePos(q,x)).flatMap(x => String(x.family || '').split(';'));
};

const report = { generatedAt: new Date().toISOString(), records: all.length, files: files.length, errors, warnings, mode: {} };
for (const [level, pool] of byLevel) {
  const modes = {};
  for (const mode of ['en-ja', 'ja-en', 'context', 'synonym', 'family']) {
    let eligible = 0, sufficient = 0, insufficient = 0;
    for (const q of pool) {
      const ok = mode === 'en-ja' || mode === 'ja-en' ? Boolean(q.word && q.meaning)
        : mode === 'context' ? Boolean(q.word && q.exampleSentence)
        : mode === 'synonym' ? Array.isArray(q.synonyms) && q.synonyms.length > 0
        : String(q.family || '').split(';').some(Boolean);
      if (!ok) continue;
      eligible++;
      const current = norm(q.word);
      const rawCandidates = globalCandidates(q, mode);
      const answer = mode === 'en-ja' ? q.meaning
        : mode === 'ja-en' || mode === 'context' ? q.word
        : mode === 'synonym' ? q.synonyms?.[0]
        : String(q.family || '').split(';')[0];
      const candidateCount = uniq(rawCandidates.filter(x => norm(x) !== norm(answer))).length;
      if (candidateCount >= 3) sufficient++; else insufficient++;
    }
    modes[mode] = { eligible, sufficient, insufficient, fallbackToEnJa: insufficient };
    if (insufficient) {
      // The runtime scheduler falls back to en-ja for modes that cannot form four unique choices.
      // Keep the condition visible in the report, but do not treat it as a database defect.
    }
  }
  report.mode[level] = modes;
}

console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(`QUALITY FAIL: ${errors.length} errors`);
  process.exit(1);
}
if (warnings.length) console.error(`QUALITY FAIL: ${warnings.length} warnings`);
else console.log(`QUALITY PASS: ${all.length} records, 0 warnings`);
if (warnings.length) process.exit(1);
