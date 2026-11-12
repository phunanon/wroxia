export const meta = {
  name: 'debate',
  description:
    'Newcomers from around the world debate the current text turn by turn; an analyst extracts unclear text, injustices, misreadings, and cases',
  whenToUse:
    'To find leads in the current text through argument. Optional args: { topic, personas: [[name, description], ...], rounds }.',
  phases: [
    { title: 'Openings', detail: 'each persona reads the law and opens' },
    {
      title: 'Debate',
      detail: 'sequential rounds; each speaker sees the full transcript',
    },
    { title: 'Closings', detail: 'one change, one fear' },
    {
      title: 'Analysis',
      detail: 'unclear text, injustices, misreadings, cases',
    },
  ],
};

const P = args?.personas ?? [
  [
    'Morag',
    'Morag MacLeod, 64, a crofter and grazings clerk from the Isle of Lewis, Scotland, whose family survived the Clearances and who helped run a community buyout',
  ],
  [
    'Chidi',
    "Chidi Okafor, 45, a property developer from Lagos, Nigeria, who builds estates and has fought the Land Use Act 1978 and its governor's certificates of occupancy",
  ],
  [
    'Wei Ling',
    'Tan Wei Ling, 67, a retired Singapore Housing and Development Board town planner who worked under the Land Acquisition Act',
  ],
  [
    'Lemayian',
    'Lemayian ole Saitoti, 52, a Maasai pastoralist and group ranch committee member from Kajiado, Kenya, who watched the group ranches subdivided and sold',
  ],
  [
    'Hannah',
    'Hannah Brennan, 39, a Georgist economist from Melbourne, Australia, who campaigns for land value tax',
  ],
  [
    'Joana',
    "Joana Ferreira, 48, an organiser of a Landless Workers' Movement (MST) settlement in Paraná, Brazil",
  ],
  [
    'Marcus',
    'Marcus Webb, 58, a property-rights litigator from Connecticut, USA, who fought eminent domain takings after Kelo v. New London',
  ],
  [
    'Lena',
    "Lena Vogel, 34, a tenants' association lawyer from Berlin, Germany, who worked on the rent cap and the Deutsche Wohnen expropriation referendum",
  ],
];
const TOPIC = args?.topic ?? 'land';
const ROUNDS = args?.rounds ?? 2;

const LAW = `You are taking part in a frank, unscripted debate about ${TOPIC} in Wroxia, a hypothetical country. Its constitution is Constitution.md and its instruments are Instruments.md, both in the repository root. Read both, focusing on what bears on ${TOPIC}. Read no other files in the repository: you know only the law. Judge the text exactly as it stands. You have just arrived and become a citizen.`;

const VOICE = (who) =>
  `You are ${who}. Speak in your own voice, drawing on your own life and your country's history. Be concrete: walk through what would happen to people like you, with named examples and figures. Quote the text when you rely on it, and say plainly where it is silent or reads two ways. Argue: challenge others by name, concede when they are right, and don't drift into politeness or consensus. Spoken prose only, no headings or lists.`;

const transcript = [];
const say = (name, text) => transcript.push(`${name}: ${String(text).trim()}`);
const t = () => transcript.join('\n\n');

phase('Openings');
const openings = await parallel(
  P.map(
    ([name, who]) =>
      () =>
        agent(
          `${LAW}\n\n${VOICE(who)}\n\nGive your opening reaction, under 220 words: what this text would do for, and to, people like you. Reply with your words only.`,
          { label: `open:${name}`, phase: 'Openings' },
        ),
  ),
);
openings.forEach((o, i) => o && say(P[i][0], o));

phase('Debate');
for (let round = 0; round < ROUNDS; round++) {
  const shift = 3 + 2 * round;
  for (const [name, who] of P.map((_, i) => P[(i + shift) % P.length])) {
    const r = await agent(
      `${LAW}\n\n${VOICE(who)}\n\nThe debate so far:\n\n${t()}\n\nIt is your turn, ${name}. Under 220 words. Answer what was just said and anyone you disagree with; raise a case the others have missed if you have one. Reply with your words only.`,
      { label: `turn:${name}`, phase: 'Debate' },
    );
    if (r) say(name, r);
  }
  log(`Round ${round + 1} done: ${transcript.length} turns`);
}

phase('Closings');
const closings = await parallel(
  P.map(
    ([name, who]) =>
      () =>
        agent(
          `${LAW}\n\n${VOICE(who)}\n\nThe debate so far:\n\n${t()}\n\nGive your closing statement, under 150 words: the one change to the text you would make, and the outcome you most fear. Reply with your words only.`,
          { label: `close:${name}`, phase: 'Closings' },
        ),
  ),
);
closings.forEach((c, i) => c && say(P[i][0], `(closing) ${c}`));

phase('Analysis');
const analysis = await agent(
  `You are an analyst for Wroxia, a hypothetical constitution. Read Constitution.md and Instruments.md in the repository root, then this debate about ${TOPIC} among newcomers:\n\n${t()}\n\nReport, concisely, in Markdown:\n1. Where speakers read the text differently: quote both readings and the words they turn on. These signal unclear text.\n2. Outcomes speakers found unjust or surprising that genuinely follow from the text, with who suffers.\n3. Where a speaker misread the text: what they said, and what it actually says.\n4. Anything the debate never touched that it should have.\n5. Up to ten candidate cases, each as a block 'ID: scenario', a neutral account with named people and figures and no expected answer.`,
  { label: 'analyst', phase: 'Analysis' },
);

return { transcript: t(), analysis };
