// Hears cases: fresh models judge each case under the working-tree law. See README.md.
import { start, using, readEntries, law, lawHash, json } from './shared.mjs';

const enums = {
  outcome: ['breach', 'no breach', 'unclear'],
  forbiddable: ['yes', 'no', 'unclear'],
  jurisdiction: ['nearlaw', 'farlaw', 'both', 'unclear'],
};
const lists = ['articles', 'gaps'];
const letters = ['A', 'B', 'C', 'D', 'E'];
const texts = ['facts', 'reasoning', 'consequence'];

// A case may end with any number of "Ask: question? A) … B) …", then
// "Expect: choice1=B; outcome=breach". Each Ask adds a choiceN field to the
// ruling; expecting makes each run pass or fail.
const isChoice = (f) => /^choice\d+$/.test(f);
function split(text) {
  const [rest, expect] = text.split(/\s+Expect:\s+/);
  const [scenario, ...asks] = rest.split(/\s+Ask:\s+/);
  return {
    scenario,
    asks,
    expect: Object.fromEntries(
      (expect ?? '')
        .split(/;\s*/)
        .filter(Boolean)
        .map((p) => p.split('=').map((x) => x.trim())),
    ),
  };
}

// Reasoning comes before the verdict, so that models without thinking reason first.
const fieldsFor = (asks) => [
  'facts',
  'articles',
  'reasoning',
  ...asks.map((_, i) => `choice${i + 1}`),
  ...Object.keys(enums),
  'consequence',
  'gaps',
];

const schemaFor = (fields) => ({
  type: 'object',
  additionalProperties: false,
  required: fields,
  properties: Object.fromEntries(
    fields.map((f) => [
      f,
      isChoice(f)
        ? { type: 'string', enum: letters }
        : enums[f]
          ? { type: 'string', enum: enums[f] }
          : lists.includes(f)
            ? { type: 'array', items: { type: 'string' } }
            : { type: 'string' },
    ]),
  ),
});

function prompt(scenario, asks) {
  return `You are a judge in Wroxia. Its only law is the constitution and instruments below. Use nothing else: no other country's law, and no guesses about what the authors intended. Do not use tools.

${law()}

Case: ${scenario}
${asks.map((a, i) => `\nQuestion ${i + 1}: ${a}`).join('')}

Read the case as an ordinary reader would: named people are human, and anything done to someone against their evident interest, such as taking, attacking, watching or sharing, was without their consent unless the case says otherwise. Treat as open only what the case genuinely leaves open.

Reason first, then decide, in this order:
- facts: the facts that matter, as the case states them, adding nothing.
- articles: the provisions that bear on those facts, such as "II.2.3", "I.1.3", "I.2.2" or "Instrument 2.1".
- reasoning: three to six sentences applying those provisions to the facts.
${asks.map((_, i) => `- choice${i + 1}: the letter of the one answer to Question ${i + 1} that the law supports best.\n`).join('')}- outcome: "breach" if at least one breach of the constitution is established, "no breach" if none is, "unclear" if the text does not settle it.
- forbiddable: may Wroxian law forbid any act described? "yes", "no" or "unclear". If the case concerns a law, judge the conduct that law regulates.
- jurisdiction: whose matter it is under IV.2: "nearlaw", "farlaw", "both" or "unclear".
- consequence: one sentence on what follows (restitution, prevention or nothing).
- gaps: at most three questions the text leaves open whose answer would change your decision; empty if none.

Reply with only a JSON object of this shape:
{"facts": "...", "articles": ["...", "..."], "reasoning": "...", ${asks.map((_, i) => `"choice${i + 1}": "A", `).join('')}"outcome": "...", "forbiddable": "...", "jurisdiction": "...", "consequence": "...", "gaps": ["..."]}`;
}

function parse(text, fields) {
  const ruling = json(text);
  for (const f of fields) {
    const v = ruling?.[f];
    const ok = isChoice(f)
      ? letters.includes(v)
      : enums[f]
        ? enums[f].includes(v)
        : lists.includes(f)
          ? Array.isArray(v) && v.every((i) => typeof i === 'string')
          : texts.includes(f) && typeof v === 'string';
    if (!ok) throw new Error(`bad field "${f}": ${JSON.stringify(v)}`);
  }
  return ruling;
}

// Whether law may forbid the act is reported but never counts as a split.
const verdict = (r) =>
  [...Object.keys(r).filter(isChoice), ...Object.keys(enums)]
    .filter((f) => f !== 'forbiddable' && r[f])
    .map((f) => r[f])
    .join(' / ');

// The expected answers a ruling misses, as "field: got".
const misses = (r, expect) =>
  Object.entries(expect)
    .filter(([f, v]) => r[f] !== v)
    .map(([f]) => `${f}: ${r[f]}`);

// Each run is { model, ruling } or { model, error }.
// Failed runs are reported but do not count as disagreement.
// With expected answers, a case passes only if every heard run matches them.
function report(id, runs, expect) {
  const heard = runs.filter((r) => r.ruling);
  const verdicts = new Set(heard.map((r) => verdict(r.ruling)));
  const agreed = verdicts.size === 1 && heard.length > 1;
  const failed = runs.length - heard.length;
  const keyed = Object.keys(expect).length > 0;
  const passes = heard.filter((r) => !misses(r.ruling, expect).length).length;
  const mark = !keyed
    ? ''
    : passes === heard.length && heard.length
      ? 'PASS'
      : passes
        ? 'MIXED'
        : 'FAIL';
  const wanted = Object.entries(expect)
    .map((e) => e.join('='))
    .join('; ');
  console.log(
    `\n${id}: ${mark ? `${mark}, ` : ''}${agreed ? 'agree' : verdicts.size > 1 ? 'SPLIT' : 'too few runs'} — ${[...verdicts].join(' | ')}${failed ? ` (${failed} failed)` : ''}${keyed ? ` [expected ${wanted}]` : ''}`,
  );
  for (const { model, ruling, error } of runs) {
    if (error) {
      console.log(`  ${model}: ERROR ${error}`);
      continue;
    }
    console.log(
      `  ${model}: ${verdict(ruling)} (forbiddable: ${ruling.forbiddable}) [${ruling.articles.join(', ')}]`,
    );
    console.log(`    ${ruling.consequence}`);
    if (!agreed || misses(ruling, expect).length)
      console.log(`    ${ruling.reasoning}`);
    for (const gap of ruling.gaps) console.log(`    gap: ${gap}`);
  }
  return { agreed, mark };
}

function summary(results) {
  const keyed = results.filter((r) => r.mark);
  const unpassed = keyed.filter((r) => r.mark !== 'PASS').map((r) => r.id);
  if (keyed.length)
    console.log(
      `\n${keyed.length - unpassed.length}/${keyed.length} pass their expected answers${unpassed.length ? `; not passed: ${unpassed.join(', ')}` : ''}`,
    );
  const other = results.filter((r) => !r.agreed).map((r) => r.id);
  console.log(
    `\n${results.length - other.length}/${results.length} agree${other.length ? `; not agreed: ${other.join(', ')}` : ''}`,
  );
}

const opts = await start(
  'workflows/hear.mjs [--backend offline|online|print] [--models a,b] [--runs 2] [--out runs.jsonl] <T9 | tests | cases.txt>...',
  { runs: { type: 'string' } },
);
const cases = readEntries(opts.positionals, 'T', 'Scenario', 'tests').map(
  (c) => ({ id: c.id, ...split(c.text) }),
);
const seeds = Array.from(
  { length: Number(opts.runs ?? opts.backend.runs ?? 2) },
  (_, i) => i + 1,
);
const runs = [];
const results = {};
const total = opts.models.length * seeds.length;
console.log(
  `Hearing ${cases.length} case(s) × ${opts.models.length * seeds.length} runs against law ${lawHash()}, one model at a time...`,
);
for (const model of opts.models) {
  await using(opts.backend, model, (ask, all) =>
    all(
      cases.flatMap((c) =>
        seeds.map((seed) => async () => {
          let run;
          try {
            const fields = fieldsFor(c.asks);
            run = {
              id: c.id,
              model,
              ruling: parse(
                await ask(prompt(c.scenario, c.asks), schemaFor(fields), seed),
                fields,
              ),
            };
          } catch (e) {
            run = { id: c.id, model, error: e.message };
          }
          runs.push(run);
          opts.log(run);
          const mine = runs.filter((r) => r.id === c.id);
          if (mine.length === total)
            results[c.id] = report(c.id, mine, c.expect);
          console.error(
            `${c.id} ${model} #${seed}: ${run.ruling?.outcome ?? run.error}`,
          );
        }),
      ),
    ),
  );
}
summary(cases.map((c) => ({ id: c.id, ...results[c.id] })));
