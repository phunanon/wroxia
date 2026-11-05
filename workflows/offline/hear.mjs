// Hears cases with local models through llama-server. See AGENTS.md.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readCases, prompt, parse, schema, report, summary } from '../hearing.mjs';

const here = import.meta.dirname;
const profiles = {
  'qwen3.6-35b': { file: 'Qwen3.6-35B-A3B-UD-IQ4_XS.gguf', args: ['--gpu-layers', '99', '--n-cpu-moe', '99'] },
  'qwen3.5-4b': { file: 'Qwen3.5-4B-Q4_K_M.gguf', args: ['--gpu-layers', '16'] },
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    models: { type: 'string', default: Object.keys(profiles).join(',') },
    runs: { type: 'string', default: '2' },
    port: { type: 'string', default: '8087' },
  },
});
if (!positionals.length) {
  console.error(`Usage: node workflows/offline/hear.mjs [--models ${Object.keys(profiles).join(',')}] [--runs 2] <T9 | tests | cases.txt>...`);
  process.exit(2);
}
const url = `http://127.0.0.1:${values.port}`;

async function serve(name) {
  const profile = profiles[name];
  if (!profile) throw new Error(`Unknown model ${name}`);
  const server = spawn(join(here, 'runtime', 'llama-server.exe'), [
    '-m', join(here, profile.file), '--host', '127.0.0.1', '--port', values.port,
    '--ctx-size', '8192', '--parallel', '1', '--threads', '6',
    '--flash-attn', 'on', '--jinja', ...profile.args,
  ], { cwd: here, stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 600; i++) {
    if (server.exitCode !== null) throw new Error(`llama-server exited with ${server.exitCode}`);
    try { if ((await fetch(`${url}/health`)).ok) return server; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  server.kill();
  throw new Error('llama-server did not become ready');
}

async function call(text, seed) {
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: text }],
      response_format: { type: 'json_schema', json_schema: { name: 'ruling', schema } },
      chat_template_kwargs: { enable_thinking: false },
      // Qwen's recommended non-thinking sampling.
      temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, presence_penalty: 1.5,
      max_tokens: 1024, seed, cache_prompt: true,
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const choice = (await response.json()).choices[0];
  if (choice.finish_reason !== 'stop') throw new Error(`stopped by ${choice.finish_reason}`);
  return choice.message.content;
}

const cases = readCases(positionals);
const models = values.models.split(',');
const runs = [];
console.log(`Hearing ${cases.length} case(s) × ${models.length * Number(values.runs)} runs, one model at a time...`);
for (const model of models) {
  const server = await serve(model);
  try {
    for (const c of cases) {
      for (let seed = 1; seed <= Number(values.runs); seed++) {
        try { runs.push({ id: c.id, model, ruling: parse(await call(prompt(c.scenario), seed)) }); }
        catch (e) { runs.push({ id: c.id, model, error: e.message }); }
      }
    }
  } finally {
    server.kill();
  }
}
summary(cases.map(c => ({ id: c.id, agreed: report(c.id, runs.filter(r => r.id === c.id)) })));
