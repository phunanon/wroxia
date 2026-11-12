// Isolated, tool-less Copilot CLI calls. See AGENTS.md.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const models = ['claude-haiku-5.5', 'gpt-6-luna'];
export const parallel = 8;

const base = join(process.env.LOCALAPPDATA, 'wroxia-arbiter');
const home = join(base, 'home');
const empty = join(base, 'empty');
const copilot = join(
  process.env.LOCALAPPDATA,
  'GitHubCopilotCLI',
  'copilot.exe',
);
mkdirSync(empty, { recursive: true });

// An empty --available-tools does not remove built-in tools, so each is
// excluded by name. Any tool event in the output still fails the run.
const tools = [
  'powershell',
  'read_powershell',
  'stop_powershell',
  'list_powershell',
  'bash',
  'read_bash',
  'write_bash',
  'stop_bash',
  'list_bash',
  'view',
  'create',
  'edit',
  'apply_patch',
  'rg',
  'grep',
  'glob',
  'web_fetch',
  'web_search',
  'fetch_copilot_cli_documentation',
  'semantic_code_search',
  'skill',
  'run_dynamic_workflow',
  'dynamic_workflows_manage',
  'sql',
  'session_store_sql',
  'task',
  'read_agent',
  'list_agents',
  'write_agent',
  'ask_user',
  'store_memory',
  'vote_memory',
];
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith('COPILOT_')),
);
env.COPILOT_HOME = home;

// Each call is a fresh session, so there is nothing to start or stop. The CLI
// cannot enforce a schema or seed; the prompt carries the shape.
export async function open(model) {
  return { ask: (text) => call(model, text), close() {} };
}

function call(model, text) {
  const args = [
    '-p',
    text,
    '--model',
    model,
    '--excluded-tools',
    ...tools,
    '--disable-builtin-mcps',
    '--no-custom-instructions',
    '--no-ask-user',
    '--no-auto-update',
    '--stream',
    'off',
    '--output-format',
    'json',
  ];
  return new Promise((done, fail) => {
    const child = spawn(copilot, args, { cwd: empty, env, windowsHide: true });
    let out = '',
      err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', fail);
    child.on('close', (code) => {
      if (code)
        return fail(new Error(`exit ${code}: ${err.trim().split('\n')[0]}`));
      const events = out
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l));
      if (events.some((e) => e.type.startsWith('tool.')))
        return fail(new Error('a tool was called'));
      const reply = events
        .filter((e) => e.type === 'assistant.message')
        .at(-1)?.data;
      if (!reply) return fail(new Error('no reply'));
      if (reply.model !== model)
        return fail(new Error(`answered by ${reply.model}`));
      done(reply.content);
    });
  });
}
