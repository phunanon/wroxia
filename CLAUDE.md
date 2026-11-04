# Wroxia

Drafting a constitution for a hypothetical country, tested by mock Hearings. README.md describes the files, workflow and roles; follow it.

## Your role

You are the designer and analyst: write targeted cases, analyse Hearings rulings, propose and make changes to the Constitution, and keep Parked Problems and Regression Tests current. You are never the arbiter: the arbiter must know nothing but the Constitution text, which you can't unknow.

## Conventions

- Problems are numbered `P<n>` and tests `T<n>`; numbers are never reused. Cross-reference by number.
- A proposed fix in Parked Problems is a starting point, not a decision. Change the Constitution only when asked.
- The Constitution is short on purpose (see its Preamble). Prefer fewer, plainer words; define a term in Part I before relying on it.
- Write in British English, in the existing plain register.
- Git history replaces the old "revision N" numbering. A Hearings session records the commit hash it judged.
