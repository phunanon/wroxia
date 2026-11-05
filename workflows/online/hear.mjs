// Hears cases with isolated, tool-less Copilot CLI calls. See AGENTS.md.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readCases, prompt, parse, pool, report, summary } from '../hearing.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    models: { type: 'string', default: 'claude-haiku-5.5,gpt-6-luna' },
    runs: { type: 'string', default: '2' },
    parallel: { type: 'string', default: '8' },
  },
});
if (!positionals.length) {
  console.error('Usage: node workflows/online/hear.mjs [--models a,b] [--runs 2] <T9 | tests | cases.txt>...');
  process.exit(2);
}

const base = join(process.env.LOCALAPPDATA, 'wroxia-arbiter');
const home = join(base, 'home');
const empty = join(base, 'empty');
const copilot = join(process.env.LOCALAPPDATA, 'GitHubCopilotCLI', 'copilot.exe');
mkdirSync(empty, { recursive: true });

// An empty --available-tools does not remove built-in tools, so each is
// excluded by name. Any tool event in the output still fails the run.
const tools = [
  'powershell', 'read_powershell', 'stop_powershell', 'list_powershell',
  'bash', 'read_bash', 'write_bash', 'stop_bash', 'list_bash',
  'view', 'create', 'edit', 'apply_patch', 'rg', 'grep', 'glob',
  'web_fetch', 'web_search', 'fetch_copilot_cli_documentation',
  'semantic_code_search', 'skill', 'run_dynamic_workflow',
  'dynamic_workflows_manage', 'sql', 'session_store_sql', 'task',
  'read_agent', 'list_agents', 'write_agent', 'ask_user',
  'store_memory', 'vote_memory',
];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('COPILOT_')));
env.COPILOT_HOME = home;

function call(model, text) {
  const args = [
    '-p', text, '--model', model, '--excluded-tools', ...tools,
    '--disable-builtin-mcps', '--no-custom-instructions', '--no-ask-user',
    '--no-auto-update', '--stream', 'off', '--output-format', 'json',
  ];
  return new Promise((done, fail) => {
    const child = spawn(copilot, args, { cwd: empty, env, windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', fail);
    child.on('close', code => {
      if (code) return fail(new Error(`exit ${code}: ${err.trim().split('\n')[0]}`));
      const events = out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
      if (events.some(e => e.type.startsWith('tool.'))) return fail(new Error('a tool was called'));
      const reply = events.filter(e => e.type === 'assistant.message').at(-1)?.data;
      if (!reply) return fail(new Error('no reply'));
      if (reply.model !== model) return fail(new Error(`answered by ${reply.model}`));
      done(reply.content);
    });
  });
}

const cases = readCases(positionals);
const models = values.models.split(',');
const tasks = cases.flatMap(c => models.flatMap(model =>
  Array.from({ length: Number(values.runs) }, () => async () => {
    try { return { id: c.id, model, ruling: parse(await call(model, prompt(c.scenario))) }; }
    catch (e) { return { id: c.id, model, error: e.message }; }
  })));
console.log(`Hearing ${cases.length} case(s) × ${models.length * Number(values.runs)} runs (${tasks.length} calls)...`);
const runs = await pool(tasks, Number(values.parallel));
summary(cases.map(c => ({ id: c.id, agreed: report(c.id, runs.filter(r => r.id === c.id)) })));
