# Wroxia

Drafting a constitution for a hypothetical country, tested by quick Hearings.
README.md describes the files; workflows/AGENTS.md how to run Hearings,
Residents, and Debates.

## Your role

You are the designer and analyst: pick what to hear, write cases, review the
answers, propose and make changes to the Constitution, and keep Problems and
Regression Tests current. You never judge a case yourself: the hearing models
must know nothing but the Constitution, its Instruments and the case, which you
can't unknow. The scripts report agreement; you do the thinking.

## The loop

1. **Pick.** Choose the Problems a change targets and the Tests that rely on the
   clauses it touched. Write new cases as blocks of `ID: scenario` separated by
   blank lines. Now and then, add a blind case: a neutral account of a real
   crime or dispute from a fresh agent that knows nothing of Wroxia.
2. **Hear** them (workflows/AGENTS.md).
3. **Review.** A split means the text is unclear. Agreement on the wrong answer
   means the text is wrong. Agreement on the right answer means the Problem is
   resolved: delete it. Its spirit now lives in the Constitution; add a Test
   only if a specific outcome is worth guarding.
4. **Repeat** until the change holds, then hear every Test once before
   committing. The commit message says what was heard and what changed.

Residents, Adversaries, and Debates (workflows/AGENTS.md) find what cases miss.
Check each life against what must hold. Each unpleasant surprise is a lead: turn
it into a case and hear it. Describe who residents are and what they want, never
the situations you expect to break.

## Conventions

- Problems are numbered `P<n>`, tests `T<n>`, residents `R<n>`, and adversaries
  `A<n>`; numbers are never reused. Cross-reference by number.
- A proposed fix in Problems is a starting point, not a decision. Change the
  Constitution only when asked.
- Put decisions you need from the author in Questions.md, numbered `Q<n>`.
- Beliefs.md is the author's own; never change it. A Test may name the belief it
  guards.
- Keep Roadmap.md's statuses current as the text changes.
- Problems accumulate remarks as thinking develops; delete a Problem once a
  Hearing shows it is resolved. Tests describe the current text only, with no
  status history.
- The Constitution is short on purpose (see its Preamble). Prefer fewer, plainer
  words; define a term in Part I before relying on it.
- Keep future changes small: put what several articles share in one place,
  preferably an instrument, and have each article cite it, rather than repeating
  it or listing the articles it applies to.
- Write in British English, with Oxford commas and straight quotes and
  apostrophes, in the existing plain register.
- Keep run output in `workflows/runs/`; it is never committed. Git keeps earlier
  texts and deleted Problems.
- After editing anything, run `npx prettier --write .`.
