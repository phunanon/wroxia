// Shared by the frontends: the law as models see it, case files, the command
// line, and running work on a backend. Backends live in backends/<name>/.
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

// Arguments are IDs of entries in RegressionTests.md, such as T9 or R1, `all` for
// every entry with that prefix, or block files. The entry's text is its `field`.
export function readEntries(args, prefix, field, all) {
  const entries = new Map(
    [
      ...read('RegressionTests.md').matchAll(
        new RegExp(
          `^### (${prefix}\\d+)\\..*?\\*\\*${field}:\\*\\* (.+?)\\n\\n`,
          'gms',
        ),
      ),
    ].map(([, id, text]) => [id, text.replace(/\s+/g, ' ')]),
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
    log: (record) => appendFileSync(values.out, JSON.stringify(record) + '\n'),
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
