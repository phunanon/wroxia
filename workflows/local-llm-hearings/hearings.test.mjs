import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  extractSource,
  historicalSource,
  parseOptions,
  validateRuling,
  generateRuling,
  formatPrompt,
  request,
  samplingFor,
  parseLaunchOptions,
  consistencyWarnings,
} from './hearings.mjs';

test('a ruling of no breach that is still forbiddable is flagged for review', () => {
  assert.equal(
    consistencyWarnings({ outcome: 'no breach', forbiddable: 'yes' }).length,
    1,
  );
  for (const [outcome, forbiddable] of [
    ['no breach', 'no'],
    ['breach', 'yes'],
    ['breach', 'no'],
    ['unclear', 'yes'],
  ])
    assert.deepEqual(consistencyWarnings({ outcome, forbiddable }), []);
});

test('placement options preserve defaults and support explicit CPU-only or mixed execution', () => {
  const defaults = parseLaunchOptions([]);
  assert.equal(defaults.profile.gpuLayers, 99);
  assert.equal(defaults.profile.threads, 6);
  assert.equal(defaults.profile.context, 4096);
  const cpu = parseLaunchOptions(['--gpu-layers', '0', '--threads', '12']);
  assert.equal(cpu.profile.gpuLayers, 0);
  assert.equal(cpu.profile.threads, 12);
  assert.equal(
    parseLaunchOptions(['--gpu-layers', '16']).profile.gpuLayers,
    16,
  );
  assert.throws(() => parseLaunchOptions(['--gpu-layers=-1']), /gpu-layers/);
  assert.throws(() => parseLaunchOptions(['--threads', '0']), /threads/);
  assert.throws(() => parseLaunchOptions(['--context', '100']), /context/);
  assert.equal('cpuMoeLayers' in defaults.profile, false);
  assert.equal(
    parseLaunchOptions(['--cpu-moe', '40']).profile.cpuMoeLayers,
    40,
  );
  assert.throws(() => parseLaunchOptions(['--cpu-moe', 'all']), /cpu-moe/);
});

test('model-specific sampling is explicit and shared by provenance and generation', () => {
  const options = parseOptions([
    '--session',
    '003-modern',
    '--thinking',
    '--temperature',
    '1.0',
  ]);
  assert.equal(samplingFor(options).temperature, 1);
  assert.equal(samplingFor(options).top_p, 0.95);
  assert.equal(samplingFor({ thinking: true }).temperature, 0.6);
  assert.equal(samplingFor({}).temperature, 0.7);
  assert.throws(
    () => parseOptions(['--session', '003-modern', '--temperature', 'NaN']),
    /temperature/,
  );
  assert.throws(
    () => parseOptions(['--session', '003-modern', '--temperature', '0']),
    /temperature/,
  );
});

test('historical prompts match the archived implementation exactly', async () => {
  const source = await historicalSource(
    fileURLToPath(new URL('../../', import.meta.url)),
  );
  const html = await readFile(
    new URL('../../artefacts/third-hearings/index.html', import.meta.url),
    'utf8',
  );
  const declaration = html.match(/^const CONSTITUTION = .*;\r?$/m)[0];
  const arbiter = html.match(
    /^const arbiterPrompt = scenario => `[\s\S]*?`;/m,
  )[0];
  const original = vm.runInNewContext(
    `${declaration}\n${arbiter}\narbiterPrompt`,
  );
  assert.ok(source.cases.length >= 25);
  for (const entry of source.cases) {
    assert.deepEqual(Object.keys(entry), ['index', 'scenario']);
    assert.equal(source.prompt(entry.scenario), original(entry.scenario));
  }
});

test('expectations and other docket metadata cannot enter an arbiter prompt', () => {
  const html =
    'const CONSTITUTION = "Only this law.";\n' +
    'const arbiterPrompt = scenario => `Law: ${CONSTITUTION}\nCase: ${scenario}`;';
  const source = extractSource(html, {
    cases: [
      {
        scenario: 'An incident.',
        expect: 'SECRET',
        country: 'SECRET',
        tag: 'SECRET',
      },
    ],
    rulings: { 0: ['SECRET'] },
  });
  assert.equal(
    source.prompt(source.cases[0].scenario),
    'Law: Only this law.\nCase: An incident.',
  );
  assert.equal(JSON.stringify(source.cases).includes('SECRET'), false);
});

test('missing source declarations or scenarios fail closed', () => {
  assert.throws(() => extractSource('', { cases: [] }), /Cannot extract/);
  const html =
    'const CONSTITUTION = "Law";\nconst arbiterPrompt = scenario => `${scenario}`;';
  assert.throws(() => extractSource(html, { cases: [{}] }), /Missing scenario/);
});

test('session options reject unsafe paths and unsupported sampling counts', () => {
  assert.deepEqual(
    parseOptions(['--session', '001-smoke', '--cases', '0,1,1', '--runs', '3']),
    { session: '001-smoke', cases: [0, 1], runs: 3 },
  );
  assert.throws(
    () => parseOptions(['--session', '../escape']),
    /numbered name/,
  );
  assert.throws(
    () => parseOptions(['--session', '001-smoke', '--runs', '0']),
    /between 1 and 5/,
  );
  assert.throws(
    () => parseOptions(['--session', '001-smoke', '--cases=-1']),
    /case indices/,
  );
});

test('rulings must be complete, typed JSON, not truncated output', () => {
  const ruling = {
    outcome: 'breach',
    forbiddable: 'yes',
    jurisdiction: 'nearlaw',
    articles: ['2.1'],
    consequence: 'Restitution.',
    reasoning: 'A reason.',
    gaps: [],
  };
  assert.deepEqual(
    validateRuling({ content: JSON.stringify(ruling), stop_type: 'eos' }),
    ruling,
  );
  assert.throws(
    () =>
      validateRuling({ content: JSON.stringify(ruling), stop_type: 'limit' }),
    /budget/,
  );
  assert.throws(
    () =>
      validateRuling({
        content: JSON.stringify({ ...ruling, outcome: 'guilty' }),
      }),
    /outcome/,
  );
  assert.throws(
    () => validateRuling({ content: JSON.stringify({ ...ruling, gaps: [5] }) }),
    /gaps/,
  );
  assert.throws(() => validateRuling({ content: 'not JSON' }));
});

test('thinking is unconstrained, then JSON continues only the same case', async () => {
  const calls = [];
  const result = await generateRuling(
    'CASE<think>\n',
    42,
    { thinking: true, thinkingTokens: 2048 },
    async (endpoint, body) => {
      calls.push(body);
      return calls.length === 1
        ? {
            content: 'Consider the clauses.',
            stop_type: 'word',
            stopping_word: '</think>',
            timings: { cache_n: 100 },
          }
        : { content: '{}' };
    },
  );
  assert.equal(calls[0].json_schema, undefined);
  assert.deepEqual(calls[0].stop, ['</think>']);
  assert.equal(calls[0].n_predict, 2048);
  assert.equal(
    calls[1].prompt,
    'CASE<think>\nConsider the clauses.</think>\n\n',
  );
  assert.ok(calls[1].json_schema);
  assert.equal(calls[1].n_predict, 1024);
  assert.equal(calls[1].seed, 42);
  assert.equal(result.reasoning.content, 'Consider the clauses.');
});

test('unfinished thinking is retained as a failure, never forced into a judgement', async () => {
  let calls = 0;
  const result = await generateRuling(
    'CASE<think>\n',
    1,
    { thinking: true, thinkingTokens: 2048 },
    async () => {
      calls++;
      return { content: 'Unfinished reasoning', stop_type: 'limit' };
    },
  );
  assert.equal(calls, 1);
  assert.match(result.error, /Reasoning did not finish/);
  assert.equal(result.reasoning.content, 'Unfinished reasoning');
  const options = parseOptions(['--session', '002-thinking', '--thinking']);
  assert.equal(options.thinkingTokens, 2048);
  assert.throws(
    () => parseOptions(['--session', '002-thinking', '--thinking-tokens', '0']),
    /256 and 16384/,
  );
});

test('thinking templates may leave the opening think tag for the model to emit', async () => {
  const prompt = await formatPrompt('A case.', true, async () => ({
    prompt: '<|im_start|>assistant\n',
  }));
  assert.equal(prompt, '<|im_start|>assistant\n<think>\n');
  assert.equal(
    await formatPrompt('A case.', true, async () => ({ prompt })),
    prompt,
  );
  await assert.rejects(
    () =>
      formatPrompt('A case.', true, async () => ({ prompt: 'unsupported' })),
    /chat template/,
  );
});

test('HTTP transport preserves JSON requests and rejects non-success responses', async () => {
  const server = createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    response.writeHead(incoming.url === '/error' ? 503 : 200, {
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify({ received: Buffer.concat(chunks).toString('utf8') }),
    );
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.deepEqual(await request(`${url}/ok`, { seed: 42 }), {
      received: '{"seed":42}',
    });
    await assert.rejects(() => request(`${url}/error`), /received/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
