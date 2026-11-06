// Shared by the online and offline backends: builds each prompt from the
// working-tree Constitution, checks the JSON answers and compares the runs.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8').replaceAll("\r\n", '\n')
  .replace(/^(<p [^>]*>)?<img [^>]*>(<\/p>)?\n*/gm, '').trim(); // the flag is for readers, not judges

export const enums = {
  outcome: ['breach', 'no breach', 'unclear'],
  forbiddable: ['yes', 'no', 'unclear'],
  jurisdiction: ['nearlaw', 'farlaw', 'both', 'unclear'],
};
const lists = ['articles', 'gaps'];
const texts = ['consequence', 'reasoning'];
const fields = [...Object.keys(enums), 'consequence', 'articles', 'reasoning', 'gaps'];

export const schema = {
  type: 'object',
  additionalProperties: false,
  required: fields,
  properties: Object.fromEntries(fields.map(f => [f,
    enums[f] ? { type: 'string', enum: enums[f] }
      : lists.includes(f) ? { type: 'array', items: { type: 'string' } }
      : { type: 'string' }])),
};

// Arguments are test numbers (T9), "tests" for every test, or case files.
// A case file holds blocks separated by blank lines, each "ID: scenario".
export function readCases(args) {
  const tests = new Map(
    [...read('RegressionTests.md')
      .matchAll(/^### (T\d+)\..*?\*\*Scenario:\*\* (.+?)\n\n/gms)]
      .map(([, id, scenario]) => [id, scenario.replace(/\s+/g, ' ')]));
  return args.flatMap(arg => {
    if (arg === 'tests') return [...tests].map(([id, scenario]) => ({ id, scenario }));
    if (/^T\d+$/.test(arg)) {
      if (!tests.has(arg)) throw new Error(`No scenario found for ${arg}`);
      return [{ id: arg, scenario: tests.get(arg) }];
    }
    return readFileSync(arg, 'utf8').split(/\r?\n[ \t]*\r?\n/).filter(b => b.trim()).map(block => {
      const match = block.trim().match(/^([^:\s]+):\s*([\s\S]+)$/);
      if (!match) throw new Error(`Expected "ID: scenario" in ${arg}: ${block.slice(0, 60)}`);
      return { id: match[1], scenario: match[2].replace(/\s+/g, ' ') };
    });
  });
}

export function prompt(scenario) {
  return `You are a judge in Wroxia. Its only law is the constitution and instruments below. Use nothing else: no other country's law, and no guesses about what the authors intended. Do not use tools.

<constitution>
${read('Constitution.md')}
</constitution>

<instruments>
${read('Instruments.md')}
</instruments>

Case: ${scenario}

Read the case as an ordinary reader would: named people are human, and anything done to someone against their evident interest, such as taking, attacking, watching or sharing, was without their consent unless the case says otherwise. Treat as open only what the case genuinely leaves open.

Decide:
- outcome: "breach" if at least one breach of the constitution is established, "no breach" if none is, "unclear" if the text does not settle it.
- forbiddable: may Wroxian law forbid any act described? "yes", "no" or "unclear". If the case concerns a law, judge the conduct that law regulates.
- jurisdiction: whose matter it is under IV.2: "nearlaw", "farlaw", "both" or "unclear".
- consequence: one sentence on what follows (restitution, prevention or nothing).
- articles: the provisions you relied on, such as "II.2.3", "I.1.3", "I.2.2" or "Instrument 2.1".
- reasoning: two to four sentences tied to the facts and the text.
- gaps: at most three questions the text leaves open whose answer would change your decision; empty if none.

Reply with only a JSON object of this shape:
{"outcome": "...", "forbiddable": "...", "jurisdiction": "...", "consequence": "...", "articles": ["...", "..."], "reasoning": "...", "gaps": ["..."]}`;
}

export function parse(text) {
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
  const ruling = JSON.parse(body);
  for (const f of fields) {
    const v = ruling?.[f];
    const ok = enums[f] ? enums[f].includes(v)
      : lists.includes(f) ? Array.isArray(v) && v.every(i => typeof i === 'string')
      : texts.includes(f) && typeof v === 'string';
    if (!ok) throw new Error(`bad field "${f}": ${JSON.stringify(v)}`);
  }
  return ruling;
}

// Runs tasks with bounded concurrency, preserving order.
export async function pool(tasks, limit) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }));
  return results;
}

const verdict = r => Object.keys(enums).map(f => r[f]).join(' / ');

// Each run is { model, ruling } or { model, error }.
// Failed runs are reported but do not count as disagreement.
export function report(id, runs) {
  const heard = runs.filter(r => r.ruling);
  const verdicts = new Set(heard.map(r => verdict(r.ruling)));
  const agreed = verdicts.size === 1 && heard.length > 1;
  const failed = runs.length - heard.length;
  console.log(`\n${id}: ${agreed ? 'agree' : verdicts.size > 1 ? 'SPLIT' : 'too few runs'} — ${[...verdicts].join(' | ')}${failed ? ` (${failed} failed)` : ''}`);
  for (const { model, ruling, error } of runs) {
    if (error) { console.log(`  ${model}: ERROR ${error}`); continue; }
    console.log(`  ${model}: ${verdict(ruling)} [${ruling.articles.join(', ')}]`);
    console.log(`    ${ruling.consequence}`);
    if (!agreed) console.log(`    ${ruling.reasoning}`);
    for (const gap of ruling.gaps) console.log(`    gap: ${gap}`);
  }
  return agreed;
}

export function summary(results) {
  const other = results.filter(r => !r.agreed).map(r => r.id);
  console.log(`\n${results.length - other.length}/${results.length} agree${other.length ? `; not agreed: ${other.join(', ')}` : ''}`);
}
