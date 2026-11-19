// Usage: node forum/build.mjs <out.html> - inlines Constitution.md into the forum page.
import { readFileSync, writeFileSync } from 'node:fs';
const law = readFileSync('Constitution.md', 'utf8').replace(
  /^<p align.*\n+/,
  '',
);
const page = readFileSync('forum/forum.src.html', 'utf8');
writeFileSync(
  process.argv[2],
  page.replace('__CONSTITUTION__', () =>
    JSON.stringify(law).replaceAll('<', '\\u003c'),
  ),
);
