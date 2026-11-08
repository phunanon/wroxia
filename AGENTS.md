# Wroxia

Drafting a constitution for a hypothetical country, tested by quick Hearings.
README.md describes the files and the loop; follow it.

## Your role

You are the designer and analyst: pick what to hear, write cases, review the
answers, propose and make changes to the Constitution, and keep Problems and
Regression Tests current. You never judge a case yourself: the hearing models
must know nothing but the Constitution, its Instruments and the case, which you
can't unknow.

## Conventions

- Problems are numbered `P<n>` and tests `T<n>`; numbers are never reused.
  Cross-reference by number.
- A proposed fix in Problems is a starting point, not a decision. Change the
  Constitution only when asked.
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
- After editing Markdown, run `npx prettier --write "**/*.md"`.
