// Lives residents' years in Wroxia. A resident, blind to the law, says what
// they try to do; a clerk who knows the law says what happens; the resident
// reacts. An adversary (A<n>) also has a lawyer who knows the law and advises
// them each year. Their surprises are leads for cases. See README.md.
import { start, using, law, readEntries, json } from './shared.mjs';

const opts = await start(
  'workflows/live.mjs [--backend offline|online|print] [--models m] [--years 3] [--out lives.jsonl] <R1 | A1 | residents | residents.txt>...',
  { years: { type: 'string', default: '3' } },
);
if (opts.models.length > 1) throw new Error('live.mjs takes one model');
const years = Number(opts.years);
const residents = readEntries(
  opts.positionals,
  '[RA]',
  'Resident',
  'residents',
).map((r) => ({ ...r, years: [] }));

const str = { type: 'string' };
const list = (items) => ({ type: 'array', items });
const oneOf = (...e) => ({ type: 'string', enum: e });
const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const life = obj({
  reactions: list(
    obj({
      attempt: str,
      surprise: oneOf('pleasant', 'unpleasant', 'none'),
      feeling: str,
    }),
  ),
  events: str,
  attempts: list(obj({ attempt: str, expectation: str })),
});
const statuses = ['protected', 'allowed', 'forbidden', 'no law yet', 'unclear'];
const answers = obj({
  outcomes: list(
    obj({
      attempt: str,
      articles: list(str),
      reasoning: str,
      status: oneOf(...statuses),
      answer: str,
    }),
  ),
});

const world = `Assume both governments do whatever the constitution and instruments require of them, such as providing what a positive right entitles someone to. Beyond that, no ordinary law, government institution, or public service exists yet: where the text does not provide something, say so; never invent it. Private life goes on as anywhere, needing no law: people trade, hire, lend, and run shops, banks, churches, and charities, and may help or refuse as they choose.`;
// Law first, identical for every character that sees it, so they share a cached prefix.
const lawFirst = `Wroxia's only law is the constitution and instruments below. Use nothing else: no other country's law, and no guesses about what the authors intended. Do not use tools.\n\n${law()}\n\n${world}`;

const story = (r) =>
  r.years
    .map((y, i) =>
      [
        `Year ${i + 1}: ${y.events}`,
        ...y.attempts.map(
          (a, k) =>
            `- Tried: ${a.attempt} Expected: ${a.expectation}${y.outcomes ? ` Happened: ${y.outcomes[k]?.answer}` : ''}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');
const sofar = (r, whose) =>
  r.years.length
    ? `${whose} time in Wroxia so far:\n\n${story(r)}`
    : `${whose === 'Your' ? 'You have' : 'They have'} just arrived.`;

const lawyer = (r) => `${lawFirst}

You are the best lawyer in Wroxia, retained by a client.

Your client: ${r.text}

${sofar(r, 'Their')}

Your duty is to your client: never lecture them, or tell them to want something else; courts, not you, decide what is lawful. In one paragraph of plain words, advise them for the coming year: the boldest ways to get what they want that the text does not forbid, every gap they could exploit, and only then what would breach the rights or privileges of others and so cost them restitution.

Reply with only a JSON object of this shape:
{"advice": "..."}`;

const resident = (
  r,
  last,
) => `You are role-playing a resident of Wroxia, a country whose laws you have never read. Your description says how you came to be there. You know only what life has taught you where you came from${r.advice ? ', and what your lawyer tells you' : ''}.

Who you are: ${r.text}

${sofar(r, 'Your')}
${r.advice && !last ? `\nYour lawyer's advice for the coming year: ${r.advice}\n` : ''}
Live realistically: want what you would really want, do what you would really do, and expect what your past has taught you to expect. Life is not always kind; include setbacks as well as hopes.

Reply in this order:
- reactions: for each thing you tried last year, in order, whether what happened was a "pleasant" surprise, an "unpleasant" surprise or "none", and in one sentence how you feel; empty if you have just arrived.
- events: two to four sentences on what ${last ? 'you make of your time in Wroxia' : "has happened in your own life and household since, within your control or not. Never say what Wroxia's officials, laws, or neighbours did in answer to what you tried; the clerk tells you that"}.
- attempts: ${last ? 'empty.' : 'two or three concrete things you now try to do, new or tried a different way, never repeating an earlier attempt word for word, such as finding a home, working, schooling, worship, care, or money, each with what you expect to happen.'}

Reply with only a JSON object of this shape:
{"reactions": [{"attempt": "...", "surprise": "...", "feeling": "..."}], "events": "...", "attempts": [{"attempt": "...", "expectation": "..."}]}`;

const clerk = (r) => `${lawFirst}

You are a clerk in Wroxia, telling a newcomer what the law means for what they try to do.

The newcomer: ${r.text}

${sofar(r, 'Their')}

For each thing they tried this year, the last year above, in order:
- attempt: as given.
- articles: the provisions that bear on it, such as "II.2.5" or "Instrument 2.1".
- reasoning: one to three sentences applying them.
- status: "protected" if the constitution entitles or protects them in it; "allowed" if nothing forbids it, though nothing provides it; "forbidden" if it would breach a right or privilege; "no law yet" if it depends on a government law or service the text does not require; "unclear" if the text does not settle it.
- answer: in plain words a newcomer would understand, with no article numbers, what happens, including what others may lawfully do in response, any entitlement that would help with what they want, and anything in what they are doing that would breach the rights or privileges of others, human or not.

Reply with only a JSON object of this shape:
{"outcomes": [{"attempt": "...", "articles": ["..."], "reasoning": "...", "status": "...", "answer": "..."}]}`;

console.log(`Living ${residents.length} resident(s) for ${years} year(s)...`);
await using(opts.backend, opts.models[0], async (ask, all) => {
  // Each phase runs for everyone before the next, so the law stays in the prompt cache.
  const each = (f, who = () => true) =>
    all(
      residents
        .filter((r) => !r.error && who(r))
        .map((r) => async () => {
          try {
            await f(r);
          } catch (e) {
            r.error = e.message;
            console.error(`${r.id}: ERROR ${r.error}`);
          }
        }),
    );
  for (let year = 1; year <= years + 1; year++) {
    const last = year > years;
    if (!last)
      await each(
        async (r) => {
          r.advice = json(
            await ask(lawyer(r), obj({ advice: str }), year),
          ).advice;
          console.error(`${r.id}: year ${year} advised`);
        },
        (r) => r.id.startsWith('A'),
      );
    await each(async (r) => {
      const reply = json(await ask(resident(r, last), life, year));
      const done = r.years.at(-1);
      if (done)
        opts.log({
          id: r.id,
          year: year - 1,
          ...Object.assign(done, { reactions: reply.reactions }),
        });
      if (last) r.ending = reply.events;
      else
        r.years.push({
          advice: r.advice,
          events: reply.events,
          attempts: reply.attempts,
        });
      console.error(
        `${r.id}: ${last ? 'looked back' : `year ${year} planned`}`,
      );
    });
    if (last) break;
    await each(async (r) => {
      r.years.at(-1).outcomes = json(
        await ask(clerk(r), answers, year),
      ).outcomes;
      console.error(`${r.id}: year ${year} answered`);
    });
  }
});

const marks = { pleasant: '+', unpleasant: '-', none: ' ' };
for (const r of residents) {
  console.log(`\n${r.id}${r.error ? ` (stopped: ${r.error})` : ''}`);
  r.years.forEach((y, i) => {
    if (y.advice) console.log(`  Lawyer: ${y.advice}`);
    console.log(`  Year ${i + 1}: ${y.events}`);
    y.attempts.forEach((a, k) => {
      const o = y.outcomes?.[k],
        re = y.reactions?.[k];
      console.log(
        `  ${marks[re?.surprise] ?? '?'} ${a.attempt} → ${o?.status ?? '?'} [${o?.articles.join(', ') ?? ''}]`,
      );
      if (o) console.log(`      ${o.answer}`);
      if (re && re.surprise !== 'none') console.log(`      "${re.feeling}"`);
    });
  });
  if (r.ending) console.log(`  Looking back: ${r.ending}`);
}
const count = (s) =>
  residents
    .flatMap((r) => r.years.flatMap((y) => y.reactions ?? []))
    .filter((x) => x.surprise === s).length;
console.log(
  `\n${count('unpleasant')} unpleasant and ${count('pleasant')} pleasant surprises; each "-" is a lead for a case.`,
);
