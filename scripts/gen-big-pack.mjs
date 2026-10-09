// Generates synthetic stress-test packs into ./test-data (gitignored). NOT real exam content.
// Usage: node scripts/gen-big-pack.mjs [count=1500]
import { mkdirSync, writeFileSync } from 'node:fs';

const N = Number(process.argv[2]) || 1500;
const dir = new URL('../test-data/', import.meta.url);
mkdirSync(dir, { recursive: true });

const sources = ['dump', 'kc', 'quiz', 'claude'];
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ~60 KB fake exhibit so that image-heavy banks are represented
const bigSvg = (i) => {
  const filler = Array.from({ length: 900 }, (_, k) => `<circle cx="${(k * 7) % 500}" cy="${(k * 13) % 200}" r="2" fill="#${((k * 2654435761 + i) >>> 8).toString(16).padStart(6, '0').slice(0, 6)}"/>`).join('');
  return 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200">${filler}<text x="10" y="20">STRESS ${i}</text></svg>`).toString('base64');
};

const questions = [];
for (let i = 1; i <= N; i++) {
  const multi = rnd() < 0.3;
  const nOpt = multi ? 5 : 4 + Math.floor(rnd() * 2);
  const ids = 'ABCDEFGH'.slice(0, nOpt).split('');
  const nCorrect = multi ? 2 + Math.floor(rnd() * 2) : 1;
  const correct = [...ids].sort(() => rnd() - 0.5).slice(0, nCorrect).sort();
  const q = {
    id: `stress-${String(i).padStart(5, '0')}`,
    source: pick(sources),
    lesson: 1 + Math.floor(rnd() * 16),
    topic: `Stress topic ${1 + Math.floor(rnd() * 40)}`,
    type: multi ? 'multi' : 'single',
    question: `STRESS TEST QUESTION ${i}. ` + 'Lorem ipsum placeholder text. '.repeat(1 + Math.floor(rnd() * 6)),
    options: ids.map((id) => ({ id, text: `Option ${id} for stress question ${i}` })),
    correct,
    explanation: i % 3 === 0 ? 'Placeholder explanation.' : undefined,
  };
  if (i % 15 === 0) q.image = bigSvg(i);
  questions.push(q);
}
const exams = [1, 2, 3, 4, 5].map((n) => ({
  id: `stress-exam-${n}`,
  name: `Stress ispit ${n}`,
  questionIds: questions.slice((n - 1) * 60, n * 60).map((q) => q.id),
  durationMinutes: 105,
  passPercent: 70,
}));
writeFileSync(new URL('big-pack.json', dir), JSON.stringify({ pack: 'stress-json', questions, exams }));

const H = 'id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation';
const rows = questions.slice(0, 1200).map((q) => {
  const o = ['A', 'B', 'C', 'D', 'E', 'F'].map((l) => q.options.find((x) => x.id === l)?.text ?? '');
  return [`csv-${q.id}`, q.source, q.lesson, q.topic, q.question.replace(/;/g, ','), ...o, q.correct.join(','), q.explanation ?? ''].join(';');
});
writeFileSync(new URL('big-pack.csv', dir), '﻿' + [H, ...rows].join('\n') + '\n');
console.log(`wrote ${N} JSON questions (+${exams.length} exams) and ${rows.length} CSV rows to test-data/`);
