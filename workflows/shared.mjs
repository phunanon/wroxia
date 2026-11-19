// Shared by the frontends: the law as models see it, case files, the command
// line, and running work on a backend. Backends live in backends/<name>/.
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
export const read = (name) =>
  readFileSync(resolve(root, name), 'utf8')
    .replaceAll('\r\n', '\n')
    .replace(/^(<p [^>]*>)?<img [^>]*>(<\/p>)?\n*/gm, '')
    .trim(); // the flag is for readers, not judges

// Read once per run, so every call shares the same law and its cached prefix.
let lawText;
export const law = () =>
  (lawText ??= `<constitution>
${read('Constitution.md')}
</constitution>

<instruments>
${read('Instruments.md')}
</instruments>`);

// Names the text a result was heard against, so stale results can be told apart.
export const lawHash = () =>
  createHash('sha256').update(law()).digest('hex').slice(0, 8);

// A block file holds blocks separated by blank lines, each "ID: text".
export const readBlocks = (file) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n[ \t]*\r?\n/)
    .filter((b) => b.trim())
    .map((block) => {
      const match = block.trim().match(/^([^:\s]+):\s*([\s\S]+)$/);
      if (!match)
        throw new Error(
          `Expected "ID: text" in ${file}: ${block.slice(0, 60)}`,
        );
      return { id: match[1], text: match[2].replace(/\s+/g, ' ') };
    });

// A Test may hold a **Question:** and a task list of answers, or **Questions:**
// and a list of questions, each with a task list beneath it. The ticked answer
// is the expected one. Returns the Ask and Expect text that hear.mjs reads.
function question(entry) {
  const found = entry.match(/\*\*Questions?:\*\*(.*?)(?=\n\n\*\*|\n*$)/s);
  if (!found) return '';
  const asks = [];
  let pending = '';
  let ask;
  for (const line of found[1].split('\n')) {
    const option = line.match(/^\s*- \[( |x)\] (.*)/);
    const top = line.match(/^- (?!\[)(.*)/);
    if (option) {
      if (!ask) asks.push((ask = { q: pending.trim(), options: [] }));
      ask.options.push({ text: option[2], ticked: option[1] === 'x' });
    } else if (top) asks.push((ask = { q: top[1], options: [] }));
    else if (line.trim()) {
      if (!ask) pending += ` ${line.trim()}`;
      else if (ask.options.length) ask.options.at(-1).text += ` ${line.trim()}`;
      else ask.q += ` ${line.trim()}`;
    }
  }
  const letter = (ask) => {
    const i = ask.options.findIndex((o) => o.ticked);
    if (i < 0) throw new Error(`No ticked answer: ${ask.q}`);
    return 'ABCDE'[i];
  };
  return (
    asks
      .map(
        (a) =>
          ` Ask: ${a.q} ${a.options.map((o, i) => `${'ABCDE'[i]}) ${o.text}`).join(' ')}`,
      )
      .join('') +
    ` Expect: ${asks.map((a, i) => `choice${i + 1}=${letter(a)}`).join('; ')}`
  );
}

// Arguments are IDs of entries in RegressionTests.md, such as T9 or R1, `all` for
// every entry with that prefix, or block files. The entry's text is its `field`,
// followed by its Ask and Expect fields, if any, as hear.mjs reads them.
export function readEntries(args, prefix, field, all) {
  const entries = new Map(
    read('RegressionTests.md')
      .split(/^(?=### )/m)
      .flatMap((entry) => {
        const id = entry.match(new RegExp(`^### (${prefix}\\d+)\\.`))?.[1];
        const get = (f) =>
          entry
            .match(new RegExp(`\\*\\*${f}:\\*\\* (.+?)(?:\\n\\n|$)`, 's'))?.[1]
            .replace(/\s+/g, ' ');
        const text = get(field);
        if (!id || !text) return [];
        return [[id, text + (field === 'Scenario' ? question(entry) : '')]];
      }),
  );
  return args.flatMap((arg) => {
    if (arg === all) return [...entries].map(([id, text]) => ({ id, text }));
    if (!new RegExp(`^${prefix}\\d+$`).test(arg)) return readBlocks(arg);
    if (!entries.has(arg)) throw new Error(`No ${field} found for ${arg}`);
    return [{ id: arg, text: entries.get(arg) }];
  });
}

// Returns the path of a file in workflows/runs/, which Git ignores.
export function output(name) {
  const runs = resolve(import.meta.dirname, 'runs');
  mkdirSync(runs, { recursive: true });
  return relative('.', resolve(runs, name));
}

export const json = (text) =>
  JSON.parse(text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1'));

// Parses the options every frontend shares, plus its own, and loads the backend.
export async function start(usage, options = {}) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      backend: { type: 'string', default: 'offline' },
      models: { type: 'string' },
      out: { type: 'string' },
      ...options,
    },
  });
  if (!positionals.length) {
    console.error(`Usage: node ${usage}`);
    process.exit(2);
  }
  values.out ??= output(
    `${basename(process.argv[1], '.mjs')}-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.jsonl`,
  );
  const backend = await import(`./backends/${values.backend}/backend.mjs`);
  return {
    ...values,
    positionals,
    backend,
    models: values.models?.split(',') ?? backend.models,
    log: (record) =>
      appendFileSync(
        values.out,
        JSON.stringify({ law: lawHash(), ...record }) + '\n',
      ),
  };
}

// Opens a model on the backend, runs fn(ask, all), and closes the model even on
// failure. all(tasks) runs tasks as concurrently as the backend allows.
export async function using(backend, model, fn) {
  const { ask, close } = await backend.open(model);
  try {
    return await fn(ask, (tasks) => pool(tasks, backend.parallel));
  } finally {
    close();
  }
}

// Runs tasks with bounded concurrency, preserving order.
async function pool(tasks, limit) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    }),
  );
  return results;
}
