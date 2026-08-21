import fs from 'node:fs';
import path from 'node:path';
const dir = new URL('../public/data/grammar/', import.meta.url).pathname;
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const groups = new Map();
for (const name of fs.readdirSync(dir).filter(n => /^quiz.*\.json$/i.test(n))) {
  const file = path.join(dir, name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const q of data) {
    const k = norm(q.question);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ file: name, id: q.id, answer: q.answer });
  }
}
const dup = [...groups.entries()].filter(([, xs]) => xs.length > 1);
const report = { grammarQuestions: [...groups.values()].reduce((n, xs) => n + xs.length, 0), uniqueStems: groups.size, duplicateGroups: dup.length, duplicateExtraRecords: dup.reduce((n, [, xs]) => n + xs.length - 1, 0), groups: dup };
fs.writeFileSync(path.join(dir, 'dedupe-report.json'), JSON.stringify(report, null, 2));
console.log(`Grammar dedupe report: ${report.duplicateExtraRecords} duplicate extra records across ${report.duplicateGroups} groups.`);
if (report.duplicateExtraRecords) process.exitCode = 1;
