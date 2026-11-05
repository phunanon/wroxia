# Wroxia Constitution Project

## Files

- [The Constitution](<constitution/Constitution of Wroxia.md>) and its
  [Instruments](<constitution/Constitution of Wroxia - Instruments.md>).
- [Regression Tests](<constitution/Constitution of Wroxia - Regression Tests.md>):
  cases whose outcome must hold.
- [Problems](Problems.md): what is wrong with or missing from the Constitution.
- [Online](workflows/online/AGENTS.md) and [offline](workflows/offline/AGENTS.md)
  Hearings: two ways of hearing the same cases.

## Hearings

A Hearing is a quick clerical check of the current text, not a record. Each
case goes to fresh, isolated models that see only the Constitution, the
Instruments and the case, twice to each of two models, and come back as JSON.
The script reports whether the runs agree; the main agent does the thinking.

1. **Pick.** Choose the Problems a change targets and the Tests that rely on
   the clauses it touched. Write new cases as blocks of `ID: scenario`
   separated by blank lines. Now and then, add a blind case: a neutral account
   of a real crime or dispute from a fresh agent that knows nothing of Wroxia.
2. **Hear.** `node workflows/online/hear.mjs T9 T47 cases.txt` (or `tests` for
   every Test).
3. **Review.** A split means the text is unclear. Agreement on the wrong answer
   means the text is wrong. Agreement on the right answer means the Problem is
   resolved: delete it. Its spirit now lives in the Constitution; add a Test
   only if a specific outcome is worth guarding.
4. **Repeat** until the change holds, then hear every Test once before
   committing. The commit message says what was heard and what changed.

Nothing is saved. Git keeps earlier texts and deleted Problems for posterity.
