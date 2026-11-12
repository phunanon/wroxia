// Drains runs/queue.txt, whose lines are hear.mjs arguments, one Hearing at a
// time. A line is removed only once heard, so an interrupted drain resumes; a
// second drain exits at once. See AGENTS.md.
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { output } from './shared.mjs';

const [queue, lock] = [output('queue.txt'), output('queue.lock')];
const alive = (pid) => {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
};
if (existsSync(lock) && alive(Number(readFileSync(lock, 'utf8'))))
  process.exit();
writeFileSync(lock, String(process.pid));
const lines = () =>
  existsSync(queue)
    ? readFileSync(queue, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
    : [];

for (let job; (job = lines()[0]);) {
  const stem = output(
    `hear-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}`,
  );
  const { status, stdout } = spawnSync(
    process.execPath,
    [
      `${import.meta.dirname}/hear.mjs`,
      '--out',
      `${stem}.jsonl`,
      ...job.trim().split(/\s+/),
    ],
    { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  writeFileSync(`${stem}.txt`, stdout ?? '');
  appendFileSync(output('drained.txt'), `${stem}.txt exit ${status}: ${job}\n`);
  const rest = lines();
  rest.splice(rest.indexOf(job), 1);
  writeFileSync(queue, rest.map((l) => `${l}\n`).join(''));
}
rmSync(lock);
