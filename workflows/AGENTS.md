# Workflows

Three ways to test the text. Each sees only the law, never Problems, Tests, or
anyone's intentions. Output goes in `workflows/runs/`, which Git ignores.

The frontends [hear.mjs](hear.mjs) (Hearings) and [live.mjs](live.mjs)
(Residents) run on the [offline](backends/offline/AGENTS.md) backend by default,
the [online](backends/online/AGENTS.md) backend with `--backend online`, or
`--backend print`, which writes each prompt to `workflows/runs/` for a hearing
by hand, such as by Claude subagents. Each run logs its results there too,
unless given `--out`.

## Hearings

A Hearing is a quick clerical check of the current text, not a record. Each case
goes to fresh, isolated models that see only the Constitution, the Instruments
and the case, twice to each model (`--runs`), and come back as JSON. The script
reports whether the runs agree.

`node workflows/hear.mjs T9 T47 cases.txt` hears Tests by number (or `tests` for
every Test), and cases in files of `ID: scenario` blocks separated by blank
lines.

## Residents

A prototype (P69). `node workflows/live.mjs residents` follows each Resident and
Adversary in [Regression Tests](../RegressionTests.md) (or `R1`, `A1`, or new
ones in `ID: text` block files) through a few years in Wroxia. Each year they
say what they try to do and expect, a clerk who sees only the law says what
happens, and they react. Residents never see the law. Adversaries don't either,
but each year their lawyer, a second character who knows the law, advises them
first.

## Claude Code workflows

[claude/](claude/) holds scripts for Claude Code's Workflow tool, run with
Claude subagents: ask Claude Code to run one by its path, and save its output in
`workflows/runs/`.

- [live.js](claude/live.js) lives Residents (not Adversaries) as live.mjs does,
  given `{ residents: [{ id, text }], years }`.
- [debate.js](claude/debate.js): newcomers from around the world read only the
  law and argue about it, turn by turn, then an analyst lists unclear text,
  injustices, misreadings, and candidate cases. Optionally given
  `{ topic, personas, rounds }`.
