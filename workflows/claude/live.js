export const meta = {
  name: 'live',
  description:
    'Lives Residents through a few years in Wroxia with Claude subagents, as workflows/live.mjs does with local or online models',
  whenToUse:
    'To live Residents (not Adversaries) with Claude. args: { residents: [{ id, text }], years }, where text is the Resident field from RegressionTests.md.',
  phases: [
    { title: 'Live', detail: 'each year: resident plans, clerk answers' },
  ],
};

const YEARS = args?.years ?? 3;
const str = { type: 'string' };
const list = (items) => ({ type: 'array', items });
const oneOf = (...e) => ({ type: 'string', enum: e });
const obj = (properties) => ({
  type: 'object',
  required: Object.keys(properties),
  properties,
});
const LIFE = obj({
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
const ANSWERS = obj({
  outcomes: list(
    obj({
      attempt: str,
      articles: list(str),
      reasoning: str,
      status: oneOf(
        'protected',
        'allowed',
        'forbidden',
        'no law yet',
        'unclear',
      ),
      answer: str,
    }),
  ),
});

const world = `Assume both governments do whatever the constitution and instruments require of them, such as providing what a positive right entitles someone to. Beyond that, no ordinary law, government institution, or public service exists yet: where the text does not provide something, say so; never invent it. Private life goes on as anywhere, needing no law: people trade, hire, lend, and run shops, banks, churches, and charities, and may help or refuse as they choose.`;

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

const resident = (
  r,
  last,
) => `You are role-playing a resident of Wroxia, a country whose laws you have never read. Do not read any files or use any tools. Your description says how you came to be there. You know only what life has taught you where you came from.

Who you are: ${r.text}

${sofar(r, 'Your')}

Live realistically: want what you would really want, do what you would really do, and expect what your past has taught you to expect. Life is not always kind; include setbacks as well as hopes.

Reply in this order:
- reactions: for each thing you tried last year, in order, whether what happened was a "pleasant" surprise, an "unpleasant" surprise or "none", and in one sentence how you feel; empty if you have just arrived.
- events: two to four sentences on what ${last ? 'you make of your time in Wroxia' : "has happened in your own life and household since, within your control or not. Never say what Wroxia's officials, laws, or neighbours did in answer to what you tried; the clerk tells you that"}.
- attempts: ${last ? 'empty.' : 'two or three concrete things you now try to do, new or tried a different way, never repeating an earlier attempt word for word, such as finding a home, working, schooling, worship, care, or money, each with what you expect to happen.'}`;

const clerk = (
  r,
) => `Wroxia's only law is its constitution and instruments: read Constitution.md and Instruments.md in the repository root in full, and read no other file. Use nothing else: no other country's law, and no guesses about what the authors intended.

${world}

You are a clerk in Wroxia, telling a newcomer what the law means for what they try to do.

The newcomer: ${r.text}

${sofar(r, 'Their')}

For each thing they tried this year, the last year above, in order:
- attempt: as given.
- articles: the provisions that bear on it, such as "II.2.5" or "Instrument 2.1".
- reasoning: one to three sentences applying them.
- status: "protected" if the constitution entitles or protects them in it; "allowed" if nothing forbids it, though nothing provides it; "forbidden" if it would breach a right or privilege; "no law yet" if it depends on a government law or service the text does not require; "unclear" if the text does not settle it.
- answer: in plain words a newcomer would understand, with no article numbers, what happens, including what others may lawfully do in response, any entitlement that would help with what they want, and anything in what they are doing that would breach the rights or privileges of others, human or not.`;

const lives = await parallel(
  args.residents.map((r0) => async () => {
    const r = { ...r0, years: [] };
    for (let year = 1; year <= YEARS + 1; year++) {
      const last = year > YEARS;
      const reply = await agent(resident(r, last), {
        label: `${r.id} year ${year}${last ? ' (looking back)' : ''}`,
        phase: 'Live',
        schema: LIFE,
      });
      if (!reply) return { ...r, error: `resident failed in year ${year}` };
      if (r.years.length) r.years.at(-1).reactions = reply.reactions;
      if (last) {
        r.ending = reply.events;
        break;
      }
      r.years.push({ events: reply.events, attempts: reply.attempts });
      const answers = await agent(clerk(r), {
        label: `${r.id} clerk ${year}`,
        phase: 'Live',
        schema: ANSWERS,
      });
      if (!answers) return { ...r, error: `clerk failed in year ${year}` };
      r.years.at(-1).outcomes = answers.outcomes;
    }
    return r;
  }),
);

const marks = { pleasant: '+', unpleasant: '-', none: ' ' };
return lives
  .filter(Boolean)
  .map((r) =>
    [
      `## ${r.id}${r.error ? ` (stopped: ${r.error})` : ''}`,
      ...r.years.flatMap((y, i) => [
        `\nYear ${i + 1}: ${y.events}\n`,
        ...y.attempts.flatMap((a, k) => {
          const o = y.outcomes?.[k],
            re = y.reactions?.[k];
          return [
            `- ${marks[re?.surprise] ?? '?'} ${a.attempt} → **${o?.status ?? '?'}** [${o?.articles.join(', ') ?? ''}]`,
            o ? `  - ${o.answer}` : '',
            re && re.surprise !== 'none' ? `  - "${re.feeling}"` : '',
          ].filter(Boolean);
        }),
      ]),
      r.ending ? `\nLooking back: ${r.ending}` : '',
    ].join('\n'),
  )
  .join('\n\n');
