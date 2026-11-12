// Calls no model: writes each prompt to workflows/runs/prompt-<n>.txt, for a
// hearing by hand, such as by a Claude subagent.
import { writeFileSync } from 'node:fs';
import { output } from '../../shared.mjs';

export const models = ['print'];
export const parallel = 1;
export const runs = 1; // every run would print the same prompt
let n = 0;

export async function open() {
  return {
    ask: async (text) => {
      const file = output(`prompt-${++n}.txt`);
      writeFileSync(file, text);
      throw new Error(`wrote ${file}`);
    },
    close() {},
  };
}
