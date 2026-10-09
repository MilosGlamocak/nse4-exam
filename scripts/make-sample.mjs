// Generates sample-pack.json (placeholder content only - NOT real exam questions).
import { writeFileSync } from 'node:fs';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="220" viewBox="0 0 520 220">
<rect width="520" height="220" fill="#f4f6fa" stroke="#9aa5b8"/>
<text x="20" y="34" font-family="sans-serif" font-size="18" font-weight="bold" fill="#1d2433">SAMPLE EXHIBIT (placeholder)</text>
<rect x="30" y="70" width="130" height="90" rx="8" fill="#dbe4f5" stroke="#4a6fa5"/>
<text x="95" y="120" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#1d2433">Box 1</text>
<rect x="360" y="70" width="130" height="90" rx="8" fill="#f5e0db" stroke="#a5604a"/>
<text x="425" y="120" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#1d2433">Box 2</text>
<line x1="160" y1="115" x2="360" y2="115" stroke="#1d2433" stroke-width="3"/>
<text x="260" y="105" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#1d2433">link: blue</text>
</svg>`;
const image = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const pack = {
  pack: 'sample-pack',
  questions: [
    {
      id: 'sample-001', source: 'claude', lesson: 1, topic: 'Sample: single answer', type: 'single',
      question: 'SAMPLE (placeholder, not an exam question). Which option is marked as the correct one?',
      options: [
        { id: 'A', text: 'Option text: this is a wrong choice' },
        { id: 'B', text: 'Option text: this is the correct choice' },
        { id: 'C', text: 'Option text: this is a wrong choice' },
        { id: 'D', text: 'Option text: this is a wrong choice' },
      ],
      correct: ['B'],
      explanation: 'Placeholder explanation: option B says it is the correct choice.',
    },
    {
      id: 'sample-002', source: 'claude', lesson: 2, topic: 'Sample: single answer', type: 'single',
      question: 'SAMPLE (placeholder). This question has SIX options to test the F key (select option F vs. flag).\nPick the option that mentions "sixth".',
      options: [
        { id: 'A', text: 'first' }, { id: 'B', text: 'second' }, { id: 'C', text: 'third' },
        { id: 'D', text: 'fourth' }, { id: 'E', text: 'fifth' }, { id: 'F', text: 'sixth (correct)' },
      ],
      correct: ['F'],
    },
    {
      id: 'sample-003', source: 'claude', lesson: 3, topic: 'Sample: multiple answers', type: 'multi',
      question: 'SAMPLE (placeholder). Select the TWO options that contain the word "yes".',
      options: [
        { id: 'A', text: 'yes - select me' },
        { id: 'B', text: 'no' },
        { id: 'C', text: 'yes - select me too' },
        { id: 'D', text: 'no' },
      ],
      correct: ['A', 'C'],
      explanation: 'Placeholder explanation: A and C contain "yes". Without partial credit, selecting only one of them scores 0.',
    },
    {
      id: 'sample-004', source: 'kc', lesson: 11, topic: 'Sample: multiple answers', type: 'multi',
      question: 'SAMPLE (placeholder, source "kc" to test source filters). Select the THREE options that are even numbers.',
      options: [
        { id: 'A', text: '2' }, { id: 'B', text: '7' }, { id: 'C', text: '10' }, { id: 'D', text: '13' }, { id: 'E', text: '4' },
      ],
      correct: ['A', 'C', 'E'],
    },
    {
      id: 'sample-005', source: 'quiz', lesson: 11, topic: 'Sample: exhibit', type: 'single',
      question: 'SAMPLE (placeholder). Refer to the exhibit (click the image to zoom). What colour is the link between Box 1 and Box 2?',
      options: [
        { id: 'A', text: 'red' }, { id: 'B', text: 'blue' }, { id: 'C', text: 'green' }, { id: 'D', text: 'There is no link' },
      ],
      correct: ['B'],
      explanation: 'Placeholder explanation: the exhibit label says "link: blue".',
      image,
    },
    {
      id: 'sample-006', source: 'dump', lesson: 16, topic: 'Sample: exhibit', type: 'multi',
      question: 'SAMPLE (placeholder, source "dump" to test source filters). Refer to the exhibit. Select the TWO statements that are true.',
      options: [
        { id: 'A', text: 'The exhibit shows two boxes' },
        { id: 'B', text: 'The exhibit shows five boxes' },
        { id: 'C', text: 'The boxes are connected by a line' },
        { id: 'D', text: 'The exhibit is a photograph' },
      ],
      correct: ['A', 'C'],
      image,
    },
  ],
  exams: [
    {
      id: 'sample-exam-1', name: 'Sample ispit (placeholder)',
      questionIds: ['sample-001', 'sample-002', 'sample-003', 'sample-004', 'sample-005', 'sample-006'],
      durationMinutes: 10, passPercent: 70,
    },
  ],
};
writeFileSync(new URL('../sample-pack.json', import.meta.url), JSON.stringify(pack, null, 2) + '\n');

const H = 'id;source;lesson;topic;question;A;B;C;D;E;F;correct;explanation';
const csv = [
  H,
  'sample-csv-001;claude;4;Sample: CSV;SAMPLE (placeholder). Pick B.;wrong;right;wrong;;;;B;Placeholder explanation',
  'sample-csv-002;claude;5;Sample: CSV;SAMPLE (placeholder). Pick A and D.;yes;no;no;yes;;;A,D;',
].join('\n') + '\n';
writeFileSync(new URL('../sample-pack.csv', import.meta.url), '﻿' + csv);
console.log('ok');
