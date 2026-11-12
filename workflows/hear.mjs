// Hears cases: fresh models judge each case under the working-tree law. See README.md.
import { start, using, readEntries, law, json } from './shared.mjs';

const enums = {
  outcome: ['breach', 'no breach', 'unclear'],
  forbiddable: ['yes', 'no', 'unclear'],
  jurisdiction: ['nearlaw', 'farlaw', 'both', 'unclear'],
};
const lists = ['articles', 'gaps'];
const texts = ['facts', 'reasoning', 'consequence'];
// Reasoning comes before the verdict, so that models without thinking reason first.
const fields = [
  'facts',
  'articles',
  'reasoning',
  ...Object.keys(enums),
  'consequence',
  'gaps',
];

const schema = {
  type: 'object',
  additionalProperties: false,
  required: fields,
  properties: Object.fromEntries(
    fields.map((f) => [
      f,
      enums[f]
        ? { type: 'string', enum: enums[f] }
        : lists.includes(f)
          ? { type: 'array', items: { type: 'string' } }
          : { type: 'string' },
    ]),
  ),
};

function prompt(scenario) {
  return `You are a judge in Wroxia. Its only law is the constitution and instruments below. Use nothing else: no other country's law, and no guesses about what the authors intended. Do not use tools.

${law()}

Case: ${scenario}

Read the case as an ordinary reader would: named people are human, and anything done to someone against their evident interest, such as taking, attacking, watching or sharing, was without their consent unless the case says otherwise. Treat as open only what the case genuinely leaves open.

Reason first, then decide, in this order:
- facts: the facts that matter, as the case states them, adding nothing.
- articles: the provisions that bear on those facts, such as "II.2.3", "I.1.3", "I.2.2" or "Instrument 2.1".
- reasoning: three to six sentences applying those provisions to the facts.
- outcome: "breach" if at least one breach of the constitution is established, "no breach" if none is, "unclear" if the text does not settle it.
- forbiddable: may Wroxian law forbid any act described? "yes", "no" or "unclear". If the case concerns a law, judge the conduct that law regulates.
- jurisdiction: whose matter it is under IV.2: "nearlaw", "farlaw", "both" or "unclear".
- consequence: one sentence on what follows (restitution, prevention or nothing).
- gaps: at most three questions the text leaves open whose answer would change your decision; empty if none.

Reply with only a JSON object of this shape:
{"facts": "...", "articles": ["...", "..."], "reasoning": "...", "outcome": "...", "forbiddable": "...", "jurisdiction": "...", "consequence": "...", "gaps": ["..."]}`;
}

function parse(text) {
  const ruling = json(text);
  for (const f of fields) {
    const v = ruling?.[f];
    const ok = enums[f]
      ? enums[f].includes(v)
      : lists.includes(f)
        ? Array.isArray(v) && v.every((i) => typeof i === 'string')
        : texts.includes(f) && typeof v === 'string';
    if (!ok) throw new Error(`bad field "${f}": ${JSON.stringify(v)}`);
  }
  return ruling;
}

const verdict = (r) =>
  Object.keys(enums)
    .map((f) => r[f])
    .join(' / ');

// Each run is { model, ruling } or { model, error }.
// Failed runs are reported but do not count as disagreement.
function report(id, runs) {
  const heard = runs.filter((r) => r.ruling);
  const verdicts = new Set(heard.map((r) => verdict(r.ruling)));
  const agreed = verdicts.size === 1 && heard.length > 1;
  const failed = runs.length - heard.length;
  console.log(
    `\n${id}: ${agreed ? 'agree' : verdicts.size > 1 ? 'SPLIT' : 'too few runs'} — ${[...verdicts].join(' | ')}${failed ? ` (${failed} failed)` : ''}`,
  );
  for (const { model, ruling, error } of runs) {
    if (error) {
      console.log(`  ${model}: ERROR ${error}`);
      continue;
    }
    console.log(
      `  ${model}: ${verdict(ruling)} [${ruling.articles.join(', ')}]`,
    );
    console.log(`    ${ruling.consequence}`);
    if (!agreed) console.log(`    ${ruling.reasoning}`);
    for (const gap of ruling.gaps) console.log(`    gap: ${gap}`);
  }
  return agreed;
}

function summary(results) {
  const other = results.filter((r) => !r.agreed).map((r) => r.id);
  console.log(
    `\n${results.length - other.length}/${results.length} agree${other.length ? `; not agreed: ${other.join(', ')}` : ''}`,
  );
}

const opts = await start(
  'workflows/hear.mjs [--backend offline|online|print] [--models a,b] [--runs 2] [--out runs.jsonl] <T9 | tests | cases.txt>...',
  { runs: { type: 'string' } },
);
const cases = readEntries(opts.positionals, 'T', 'Scenario', 'tests');
const seeds = Array.from(
  { length: Number(opts.runs ?? opts.backend.runs ?? 2) },
  (_, i) => i + 1,
);
const runs = [];
console.log(
  `Hearing ${cases.length} case(s) × ${opts.models.length * seeds.length} runs, one model at a time...`,
);
for (const model of opts.models) {
  await using(opts.backend, model, (ask, all) =>
    all(
      cases.flatMap((c) =>
        seeds.map((seed) => async () => {
          let run;
          try {
            run = {
              id: c.id,
              model,
              ruling: parse(await ask(prompt(c.text), schema, seed)),
            };
          } catch (e) {
            run = { id: c.id, model, error: e.message };
          }
          runs.push(run);
          opts.log(run);
          console.error(
            `${c.id} ${model} #${seed}: ${run.ruling?.outcome ?? run.error}`,
          );
        }),
      ),
    ),
  );
}
summary(
  cases.map((c) => ({
    id: c.id,
    agreed: report(
      c.id,
      runs.filter((r) => r.id === c.id),
    ),
  })),
);
