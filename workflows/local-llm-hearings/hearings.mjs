import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { request as httpRequest } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const baseUrl = process.env.HEARINGS_URL || 'http://127.0.0.1:8087';
const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const cacheDirectory = resolve(directory, 'cache');
const shutdown = new AbortController();
const probePrompt =
  'This is a cache persistence check. No answer is required.\n'.repeat(32);
const sampling = {
  temperature: 0.7,
  top_p: 0.8,
  top_k: 20,
  min_p: 0,
  presence_penalty: 1.5,
  repeat_penalty: 1,
  n_predict: 1024,
};
const launch = {
  context: 4096,
  threads: 6,
  batch: 256,
  microbatch: 128,
  cacheK: 'f16',
  cacheV: 'f16',
  flashAttention: 'on',
  gpuLayers: 99,
};
const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { enum: ['breach', 'no breach', 'unclear'] },
    forbiddable: { enum: ['yes', 'no', 'unclear'] },
    jurisdiction: { enum: ['nearlaw', 'farlaw', 'both', 'unclear'] },
    articles: { type: 'array', items: { type: 'string' } },
    consequence: { type: 'string' },
    reasoning: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'outcome',
    'forbiddable',
    'jurisdiction',
    'articles',
    'consequence',
    'reasoning',
    'gaps',
  ],
};

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function extractSource(html, docket) {
  const constitution = JSON.parse(
    html.match(/^const CONSTITUTION = (".*");\r?$/m)?.[1] || 'null',
  );
  const template = html.match(
    /^const arbiterPrompt = scenario => `([\s\S]*?)`;/m,
  )?.[1];
  if (!constitution || !template?.includes('${scenario}')) {
    throw new Error(
      'Cannot extract the historical constitution and arbiter prompt',
    );
  }
  const prompt = scenario =>
    template
      .replace('${CONSTITUTION}', () => constitution)
      .replace('${scenario}', () => scenario);
  return {
    constitution,
    template,
    prompt,
    cases: docket.cases.map((entry, index) => {
      if (typeof entry.scenario !== 'string' || !entry.scenario.trim()) {
        throw new Error(`Missing scenario for case ${index}`);
      }
      return { index, scenario: entry.scenario };
    }),
  };
}

export async function historicalSource(root) {
  const html = await readFile(
    resolve(root, 'artefacts/third-hearings/index.html'),
    'utf8',
  );
  const docket = JSON.parse(
    await readFile(
      resolve(
        root,
        'artefacts/third-hearings/data/dockets/d1793700000000.json',
      ),
      'utf8',
    ),
  );
  return {
    ...extractSource(html, docket),
    htmlHash: digest(html),
    docketHash: digest(JSON.stringify(docket)),
  };
}

export function parseOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      session: { type: 'string' },
      cases: { type: 'string', default: 'all' },
      runs: { type: 'string', default: '3' },
      thinking: { type: 'boolean', default: false },
      'thinking-tokens': { type: 'string', default: '2048' },
      temperature: { type: 'string' },
    },
  });
  if (!/^\d{3}-[a-z0-9-]+$/.test(values.session || '')) {
    throw new Error(
      '--session must be a numbered name such as 001-calibration',
    );
  }
  if (!/^[1-5]$/.test(values.runs))
    throw new Error('--runs must be between 1 and 5');
  if (values.cases !== 'all' && !/^\d+(,\d+)*$/.test(values.cases)) {
    throw new Error(
      '--cases must be all or comma-separated zero-based case indices',
    );
  }
  if (
    !/^\d+$/.test(values['thinking-tokens']) ||
    Number(values['thinking-tokens']) < 256 ||
    Number(values['thinking-tokens']) > 16384
  )
    throw new Error('--thinking-tokens must be between 256 and 16384');
  if (
    values.temperature !== undefined &&
    (!Number.isFinite(Number(values.temperature)) ||
      Number(values.temperature) <= 0 ||
      Number(values.temperature) > 2)
  ) {
    throw new Error('--temperature must be greater than 0 and at most 2');
  }
  return {
    session: values.session,
    runs: Number(values.runs),
    cases:
      values.cases === 'all'
        ? null
        : [...new Set(values.cases.split(',').map(Number))],
    ...(values.thinking
      ? { thinking: true, thinkingTokens: Number(values['thinking-tokens']) }
      : {}),
    ...(values.temperature === undefined
      ? {}
      : { temperature: Number(values.temperature) }),
  };
}

export function samplingFor(options) {
  return {
    ...sampling,
    ...(options.thinking ? { temperature: 0.6, top_p: 0.95 } : {}),
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
  };
}

export async function generateRuling(prompt, seed, options, call = request) {
  const parameters = {
    ...samplingFor(options),
    seed,
    id_slot: 0,
    cache_prompt: true,
  };
  let reasoning;
  if (options.thinking) {
    reasoning = await call('/completion', {
      ...parameters,
      prompt,
      n_predict: options.thinkingTokens,
      stop: ['</think>'],
    });
    if (
      reasoning.truncated ||
      reasoning.stop_type !== 'word' ||
      reasoning.stopping_word !== '</think>'
    ) {
      return {
        raw: reasoning,
        reasoning,
        error:
          'Reasoning did not finish within its budget; no judgement generated',
      };
    }
    if ((reasoning.timings?.cache_n ?? 0) <= 0) {
      return {
        raw: reasoning,
        reasoning,
        error: 'Reasoning did not reuse the clean input cache',
      };
    }
    prompt += `${reasoning.content}</think>\n\n`;
  }
  const raw = await call('/completion', {
    ...parameters,
    prompt,
    json_schema: schema,
  });
  return { raw, ...(reasoning ? { reasoning } : {}) };
}

export function validateRuling(raw) {
  if (raw.truncated || raw.stop_type === 'limit')
    throw new Error('Response exhausted its token/context budget');
  const ruling = JSON.parse(raw.content);
  if (!ruling || typeof ruling !== 'object' || Array.isArray(ruling))
    throw new Error('Expected a JSON object');
  for (const [field, rule] of Object.entries(schema.properties)) {
    const value = ruling[field];
    let valid = typeof value === 'string';
    if (rule.enum) valid = rule.enum.includes(value);
    else if (rule.type === 'array')
      valid =
        Array.isArray(value) && value.every(item => typeof item === 'string');
    if (!valid) throw new Error(`Invalid ruling field: ${field}`);
  }
  if (Object.keys(ruling).some(field => !schema.required.includes(field)))
    throw new Error('Unexpected ruling fields');
  return ruling;
}

// Flags for review, not rejection: when the act judged is itself a law, the
// prompt's forbiddability question can be read differently.
export function consistencyWarnings(ruling) {
  const warnings = [];
  if (ruling.outcome === 'no breach' && ruling.forbiddable === 'yes')
    warnings.push(
      'No breach but forbiddable: Article 4.2 forbids banning acts that breach nothing',
    );
  return warnings;
}

async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}

export function parseLaunchOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      model: { type: 'string', default: 'Qwen3-4B-Q4_K_M.gguf' },
      context: { type: 'string', default: '4096' },
      'cache-type': { type: 'string', default: 'f16' },
      'gpu-layers': { type: 'string', default: '99' },
      threads: { type: 'string', default: '6' },
      'cpu-moe': { type: 'string', default: '0' },
    },
  });
  if (
    !/^\d+$/.test(values.context) ||
    Number(values.context) < 4096 ||
    Number(values.context) > 32768 ||
    !['f16', 'q8_0'].includes(values['cache-type'])
  )
    throw new Error('Use --context 4096..32768 and --cache-type f16|q8_0');
  if (
    !/^\d+$/.test(values['gpu-layers']) ||
    Number(values['gpu-layers']) > 99 ||
    !/^\d+$/.test(values.threads) ||
    Number(values.threads) < 1 ||
    Number(values.threads) > 128
  ) {
    throw new Error('Use --gpu-layers 0..99 and --threads 1..128');
  }
  if (!/^\d+$/.test(values['cpu-moe']) || Number(values['cpu-moe']) > 99)
    throw new Error('Use --cpu-moe 0..99');
  const profile = {
    ...launch,
    context: Number(values.context),
    cacheK: values['cache-type'],
    cacheV: values['cache-type'],
    gpuLayers: Number(values['gpu-layers']),
    threads: Number(values.threads),
    // Omitted when unused so earlier sessions' cache identities are unchanged.
    ...(Number(values['cpu-moe']) > 0
      ? { cpuMoeLayers: Number(values['cpu-moe']) }
      : {}),
  };
  return { model: values.model, profile };
}

async function serve() {
  const { model: modelName, profile } = parseLaunchOptions(
    process.argv.slice(3),
  );
  const url = new URL(baseUrl);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
    throw new Error('Serve requires a loopback HTTP URL');
  await mkdir(cacheDirectory, { recursive: true });
  const model = resolve(directory, modelName);
  const executable = resolve(directory, 'runtime/llama-server.exe');
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0)
    throw new Error(version.error?.message || version.stderr);
  const configuration = {
    url: baseUrl,
    model,
    modelSha256: await fileHash(model),
    version: `${version.stdout}${version.stderr}`.trim(),
    launch: profile,
  };
  const args = [
    '-m',
    model,
    '--host',
    '127.0.0.1',
    '--port',
    url.port || '80',
    '--cors-origins',
    'localhost',
    '--parallel',
    '1',
    '--ctx-size',
    String(profile.context),
    '--threads',
    String(profile.threads),
    '--batch-size',
    String(launch.batch),
    '--ubatch-size',
    String(launch.microbatch),
    '--gpu-layers',
    String(profile.gpuLayers),
    '--device',
    profile.gpuLayers === 0 ? 'none' : 'CUDA0',
    ...(profile.cpuMoeLayers
      ? ['--n-cpu-moe', String(profile.cpuMoeLayers)]
      : []),
    '--fit',
    'off',
    '--cache-type-k',
    profile.cacheK,
    '--cache-type-v',
    profile.cacheV,
    '--flash-attn',
    launch.flashAttention,
    '--slot-save-path',
    cacheDirectory,
    '--cache-ram',
    '0',
    '--no-cache-idle-slots',
    '--no-context-shift',
    '--log-verbosity',
    '4',
    '--log-file',
    resolve(cacheDirectory, 'server.log'),
  ];
  const child = spawn(executable, args, { cwd: directory, stdio: 'inherit' });
  child.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  process.once('SIGINT', () => child.kill());
  process.once('SIGTERM', () => child.kill());
  await writeJson(resolve(cacheDirectory, 'server.json'), {
    ...configuration,
    args,
    pid: child.pid,
  });
  const code = await new Promise(resolveExit =>
    child.once('exit', resolveExit),
  );
  process.exitCode = code || 0;
}

async function exclusive(action) {
  await mkdir(cacheDirectory, { recursive: true });
  const path = resolve(cacheDirectory, 'runner.lock');
  let lock;
  try {
    lock = await open(path, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(
      'Another runner holds cache/runner.lock. After an unclean stop, verify it has ended before removing the lock.',
    );
  }
  try {
    await lock.writeFile(String(process.pid));
    return await action();
  } finally {
    await lock.close();
    await unlink(path);
  }
}

export async function request(endpoint, body) {
  return new Promise((resolveResponse, reject) => {
    const operation = httpRequest(
      new URL(endpoint, baseUrl),
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([
          shutdown.signal,
          AbortSignal.timeout(30 * 60 * 1000),
        ]),
      },
      response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error(`${endpoint}: ${JSON.stringify(result)}`));
            } else resolveResponse(result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    operation.on('error', reject);
    operation.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export async function formatPrompt(content, thinking = false, call = request) {
  let { prompt } = await call('/apply-template', {
    messages: [{ role: 'user', content }],
    chat_template_kwargs: { enable_thinking: thinking },
  });
  if (thinking && prompt?.endsWith('<|im_start|>assistant\n'))
    prompt += '<think>\n';
  if (
    typeof prompt !== 'string' ||
    !prompt.endsWith(thinking ? '<think>\n' : '<think>\n\n</think>\n\n')
  ) {
    throw new Error(`Expected the Qwen thinking=${thinking} chat template`);
  }
  return prompt;
}

async function restoreCache(key) {
  const saved = await request('/slots/0?action=restore', {
    filename: `${key}.bin`,
  });
  if ((saved.n_restored ?? 0) <= 0) throw new Error('Restored cache is empty');
  return saved;
}

async function ensureCache(prompt, identity, parent) {
  const key = digest(JSON.stringify({ identity, prompt }));
  const metadataPath = resolve(cacheDirectory, `${key}.json`);
  const metadata = await readJson(metadataPath);
  if (metadata) {
    if (metadata.key !== key || metadata.promptHash !== digest(prompt))
      throw new Error('Cache metadata mismatch');
    await restoreCache(key);
    return key;
  }
  if (parent) await restoreCache(parent);
  else await request('/slots/0?action=erase', {});
  const prefill = await request('/completion', {
    prompt,
    n_predict: 0,
    cache_prompt: true,
    id_slot: 0,
  });
  if (prefill.truncated) throw new Error('Input prompt exceeded the context');
  const saved = await request('/slots/0?action=save', {
    filename: `${key}.bin`,
  });
  if ((saved.n_saved ?? 0) <= 0)
    throw new Error('Cache save produced no tokens');
  await writeJson(metadataPath, {
    key,
    promptHash: digest(prompt),
    saved,
    timings: prefill.timings,
  });
  console.log(
    `Cached ${saved.n_saved} input tokens (${Math.round(saved.n_written / 1048576)} MiB)`,
  );
  return key;
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(result.error?.message || result.stderr);
  return result.stdout.trim();
}

async function calibrate(options) {
  const source = await historicalSource(root);
  const selected = options.cases || source.cases.map(entry => entry.index);
  if (selected.some(index => !source.cases[index]))
    throw new Error('Case index is outside the historical docket');
  const server = await readJson(resolve(cacheDirectory, 'server.json'));
  if (!server || server.url !== baseUrl)
    throw new Error('Start the server with: node hearings.mjs serve');
  process.kill(server.pid, 0);
  const props = await request('/props');
  if (
    props.total_slots !== 1 ||
    props.model_path !== server.model ||
    props.default_generation_settings.n_ctx !== server.launch.context ||
    !server.version.includes(props.build_info.split('-')[0].slice(1))
  ) {
    throw new Error(
      'The active server does not match the recorded launcher configuration',
    );
  }
  const identity = {
    runnerVersion: 1,
    modelSha256: server.modelSha256,
    build: props.build_info,
    launch: server.launch,
    template: props.chat_template,
    thinking: options.thinking || false,
  };
  const marker = '__WROXIA_CASE_BOUNDARY_73819__';
  const formatted = await formatPrompt(source.prompt(marker), options.thinking);
  const prefix = formatted.slice(0, formatted.indexOf(marker));
  if (!formatted.includes(marker))
    throw new Error('Cannot locate case boundary in formatted prompt');
  const prompts = [];
  for (const index of selected) {
    const prompt = await formatPrompt(
      source.prompt(source.cases[index].scenario),
      options.thinking,
    );
    if (!prompt.startsWith(prefix))
      throw new Error('Chat template changed the shared prefix');
    const tokens = await request('/tokenize', {
      content: prompt,
      add_special: true,
    });
    if (
      tokens.tokens.length +
        sampling.n_predict +
        (options.thinkingTokens || 0) +
        8 >
      server.launch.context
    ) {
      throw new Error(
        `Case ${index} needs more context for the configured output budget`,
      );
    }
    prompts.push({ index, prompt, tokens: tokens.tokens.length });
  }
  const plan = {
    identity,
    source: {
      constitutionSha256: digest(source.constitution),
      htmlSha256: source.htmlHash,
      docketSha256: source.docketHash,
    },
    sampling: samplingFor(options),
    schema,
    options,
    prompts,
  };
  const sessionKey = digest(JSON.stringify(plan));
  const output = resolve(root, 'hearings', options.session);
  await mkdir(output, { recursive: true });
  const manifestPath = resolve(output, 'manifest.json');
  const previous = await readJson(manifestPath);
  if (previous && previous.sessionKey !== sessionKey)
    throw new Error('Session configuration changed; choose a new --session');
  if (!previous) {
    await writeJson(manifestPath, {
      sessionKey,
      startedAt: new Date().toISOString(),
      git: {
        head: git('rev-parse', 'HEAD'),
        sourceStatus: git(
          'status',
          '--porcelain',
          '--',
          'artefacts/third-hearings',
        ),
      },
      server,
      ...plan,
    });
    await writeFile(resolve(output, 'constitution.md'), source.constitution);
  }
  console.log(
    `Session ${options.session}: ${prompts.length} cases x ${options.runs} runs; ${options.thinking ? 'two-stage thinking' : 'non-thinking baseline'}`,
  );
  const prefixKey = await ensureCache(prefix, identity);
  const records = [];
  for (const entry of prompts) {
    let caseKey;
    for (let run = 1; run <= options.runs; run++) {
      const path = resolve(
        output,
        `case-${String(entry.index).padStart(3, '0')}-run-${run}.json`,
      );
      const seed = 1000 + entry.index * 100 + run;
      const previousRun = await readJson(path);
      if (previousRun) {
        if (
          previousRun.sessionKey !== sessionKey ||
          previousRun.seed !== seed ||
          previousRun.index !== entry.index ||
          previousRun.run !== run
        )
          throw new Error('Saved run belongs to another configuration');
        records.push(previousRun);
        console.log(`Case ${entry.index}, run ${run}: already recorded`);
        continue;
      }
      caseKey ||= await ensureCache(entry.prompt, identity, prefixKey);
      const restored = await restoreCache(caseKey);
      const generated = await generateRuling(entry.prompt, seed, options);
      const { raw } = generated;
      const record = {
        sessionKey,
        index: entry.index,
        run,
        seed,
        at: new Date().toISOString(),
        cache: { key: caseKey, restored },
        ...generated,
      };
      try {
        if (record.error) throw new Error(record.error);
        if ((raw.timings?.cache_n ?? 0) <= 0)
          throw new Error('Server did not reuse the restored input cache');
        record.ruling = validateRuling(raw);
        const warnings = consistencyWarnings(record.ruling);
        if (warnings.length) record.warnings = warnings;
      } catch (error) {
        record.error = error.message;
      }
      await writeJson(path, record);
      records.push(record);
      console.log(
        `Case ${entry.index}, run ${run}: ${record.error || record.ruling.outcome}; ${raw.timings?.predicted_per_second?.toFixed(1)} tokens/s`,
      );
    }
  }
  const docket = await readJson(
    resolve(root, 'artefacts/third-hearings/data/dockets/d1793700000000.json'),
  );
  const fields = ['outcome', 'forbiddable', 'jurisdiction'];
  const decision = ruling =>
    Object.fromEntries(fields.map(field => [field, ruling[field]]));
  const summary = selected.map(index => {
    const runs = records.filter(record => record.index === index);
    const reference = (docket.rulings[index] || []).map(decision);
    const local = runs
      .filter(record => record.ruling)
      .map(record => decision(record.ruling));
    return {
      index,
      scenario: source.cases[index].scenario,
      historical: reference,
      local,
      errors: runs.filter(record => record.error).map(record => record.error),
      warnings: runs
        .filter(record => record.ruling)
        .flatMap(record => consistencyWarnings(record.ruling)),
      distinctLocalDecisions: new Set(local.map(value => JSON.stringify(value)))
        .size,
      matchingHistoricalDecisions: local.filter(value =>
        reference.some(item => JSON.stringify(item) === JSON.stringify(value)),
      ).length,
    };
  });
  await writeJson(resolve(output, 'summary.json'), summary);
  console.log(
    `Recorded results in hearings/${options.session}. Decision matches are comparisons, not correctness scores.`,
  );
}

async function probe(restoreOnly) {
  const body = {
    prompt: probePrompt,
    n_predict: 0,
    id_slot: 0,
    cache_prompt: true,
  };
  if (!restoreOnly) {
    await request('/slots/0?action=erase', {});
    const cold = await request('/completion', body);
    const saved = await request('/slots/0?action=save', {
      filename: 'probe.bin',
    });
    console.log(JSON.stringify({ cold: cold.timings, saved }, null, 2));
  }
  await request('/slots/0?action=erase', {});
  const restored = await request('/slots/0?action=restore', {
    filename: 'probe.bin',
  });
  const warm = await request('/completion', body);
  if ((restored.n_restored ?? 0) <= 0 || (warm.timings?.cache_n ?? 0) <= 0) {
    throw new Error(
      `Cache was not reused: ${JSON.stringify({ restored, warm })}`,
    );
  }
  console.log(JSON.stringify({ restored, warm: warm.timings }, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === 'serve') {
    await serve();
  } else if (command === 'probe' || command === 'probe-restore') {
    await exclusive(() => probe(command === 'probe-restore'));
  } else if (command === 'calibrate') {
    await exclusive(() => calibrate(parseOptions(process.argv.slice(3))));
  } else {
    throw new Error(
      'Usage: node hearings.mjs serve [--model FILE --context 8192 --cache-type q8_0 --gpu-layers 99 --cpu-moe 99 --threads 6] | probe | probe-restore | calibrate --session 001-calibration [--cases 0,1,9 --runs 3 --thinking --thinking-tokens 2048]',
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.once('SIGINT', () => shutdown.abort());
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
