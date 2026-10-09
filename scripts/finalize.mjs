// Copies the single-file build output to ./nse4-exam.html (the deliverable) and sanity-checks it.
import { copyFileSync, readFileSync, statSync } from 'node:fs';

const src = new URL('../dist/index.html', import.meta.url);
const dst = new URL('../nse4-exam.html', import.meta.url);
const html = readFileSync(src, 'utf8');

const external = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(?!data:|#)([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^data:/.test(u));
if (external.length) {
  console.error('ERROR: output references external files:', external);
  process.exit(1);
}
copyFileSync(src, dst);
console.log(`nse4-exam.html written (${(statSync(dst).size / 1024).toFixed(0)} KB, fully self-contained)`);
