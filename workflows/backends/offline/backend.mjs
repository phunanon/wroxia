// Local models through llama-server. See AGENTS.md.
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const here = import.meta.dirname;
const port = '8087';
const url = `http://127.0.0.1:${port}`;
const profiles = {
  'qwen3.6-35b': {
    file: 'Qwen3.6-35B-A3B-UD-IQ4_XS.gguf',
    args: ['--gpu-layers', '99', '--n-cpu-moe', '99'],
  },
  'qwen3.5-4b': {
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    args: ['--gpu-layers', '16'],
  },
};
export const models = ['qwen3.6-35b'];
export const parallel = 1;

// Starts a server for the model; close() stops it.
export async function open(model) {
  const profile = profiles[model];
  if (!profile)
    throw new Error(
      `Unknown model ${model}; known: ${Object.keys(profiles).join(', ')}`,
    );
  const server = spawn(
    join(here, 'runtime', 'llama-server.exe'),
    [
      '-m',
      join(here, profile.file),
      '--host',
      '127.0.0.1',
      '--port',
      port,
      '--ctx-size',
      '16384',
      '--parallel',
      '1',
      '--threads',
      '6',
      '--flash-attn',
      'on',
      '--jinja',
      ...profile.args,
    ],
    { cwd: here, stdio: 'ignore', windowsHide: true },
  );
  const close = () => server.kill();
  for (let i = 0; i < 600; i++) {
    if (server.exitCode !== null)
      throw new Error(`llama-server exited with ${server.exitCode}`);
    try {
      if ((await fetch(`${url}/health`)).ok) return { ask, close };
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  close();
  throw new Error('llama-server did not become ready');
}

async function ask(text, schema, seed = 1) {
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: text }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'reply', schema },
      },
      chat_template_kwargs: { enable_thinking: false },
      // Qwen's recommended non-thinking sampling.
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
      presence_penalty: 1.5,
      max_tokens: 2048,
      seed,
      cache_prompt: true,
      // Streamed, so a slow reply never hits fetch's 5-minute header timeout.
      stream: true,
    }),
  });
  if (!response.ok)
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  let content = '',
    finish;
  for (const [, data] of (await response.text()).matchAll(/^data: ({.*)$/gm)) {
    const c = JSON.parse(data).choices[0];
    content += c?.delta?.content ?? '';
    finish = c?.finish_reason ?? finish;
  }
  if (finish !== 'stop') throw new Error(`stopped by ${finish}`);
  return content;
}
