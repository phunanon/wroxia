// Citation checker: a read-only, post-hoc check of Hearing results against the
// current law alone. It flags cited provisions that don't exist, quotes not
// found in the law, and reasoning that leans on provisions the ruling didn't
// cite. It never calls a model.
// Usage: node workflows/check.mjs [results.jsonl ...]   (default: the latest)
import { readFileSync, readdirSync } from 'node:fs';
import { law, lawHash } from './shared.mjs';

const text = law();
const ids = new Set();
let section = '',
  parent = '';
for (const line of text.split('\n')) {
  const head = line.match(/^#{2,3} (Instrument \d+|[IVX]+\.\d+)\./);
  if (head) ids.add((section = head[1]));
  const part = line.match(/^## Part ([IVX]+):/);
  if (part) section = part[1];
  const item = line.match(/^( *)(\d+)\. /);
  if (!item || !section) continue;
  if (item[1]) ids.add(`${parent}.${item[2]}`);
  else ids.add((parent = `${section}.${item[2]}`));
}

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const flat = ` ${norm(text)} `;
const found = (q) =>
  q
    .split(/\.{2,}|…/)
    .map(norm)
    .filter((f) => f.split(' ').length > 1)
    .every((f) => flat.includes(f));

const ID = /\bInstrument \d+(?:\.\d+)?|\b[IVX]+\.\d+(?:\.\d+)?/g;
const QUOTE = /(?:^|[\s(])['"“‘]([^'"”’]{12,}?)['"”’](?=[\s).,;:]|$)/g;
const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [
        readdirSync(new URL('runs', import.meta.url))
          .filter((f) => /^hear-.*\.jsonl$/.test(f))
          .sort()
          .pop(),
      ].map((f) => `workflows/runs/${f}`);

let runs = 0,
  stale = 0;
const tally = { missing: 0, quote: 0, uncited: 0 };
for (const file of files) {
  console.log(`${file} (law now ${lawHash()})`);
  for (const l of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const { id, model, ruling: r, law: heard } = JSON.parse(l);
    if (!r?.articles) continue;
    runs++;
    if (heard !== lawHash()) stale++;
    const tag = `${id} ${model}${heard === lawHash() ? '' : ' [other law]'}`;
    const cited = new Set(r.articles);
    for (const a of cited)
      if (!ids.has(a.trim()))
        (tally.missing++,
          console.log(`  ${tag}: cites ${a}, which doesn't exist`));
    const prose = `${r.reasoning} ${r.consequence}`;
    for (const [, q] of prose.matchAll(QUOTE))
      if (!found(q))
        (tally.quote++, console.log(`  ${tag}: quotes "${q}", not in the law`));
    for (const a of new Set(prose.match(ID)))
      if (
        ids.has(a) &&
        ![...cited].some(
          (c) => c.startsWith(a + '.') || a.startsWith(c + '.') || c === a,
        )
      )
        (tally.uncited++,
          console.log(`  ${tag}: relies on ${a} without citing it`));
  }
}
console.log(
  `${runs} runs: ${tally.missing} missing provisions, ${tally.quote} quotes not found, ${tally.uncited} uncited reliances (${stale} runs heard under another law)`,
);
