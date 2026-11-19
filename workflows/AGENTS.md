# Workflows

Three ways to test the text. Each sees only the law, never Problems, Tests, or
anyone's intentions. Output goes in `workflows/runs/`, which Git ignores.

The frontends [hear.mjs](hear.mjs) (Hearings) and [live.mjs](live.mjs)
(Residents) run on the [offline](backends/offline/AGENTS.md) backend by default,
the [online](backends/online/AGENTS.md) backend with `--backend online`, or
`--backend print`, which writes each prompt to `workflows/runs/` for a hearing
by hand, such as by Claude subagents. Each run logs its results there too,
unless given `--out`.

Offline Hearings are free: queue them whenever they would help. Claude subagent
Hearings settle what the offline model can't, such as a split it keeps
repeating. They cost money, so ask the author first. Run them on Sonnet, one
subagent per prompt file, each told to read only that file.

## Hearings

A Hearing is a quick clerical check of the current text, not a record. Each case
goes to fresh, isolated models that see only the Constitution, the Instruments
and the case, twice to each model (`--runs`), and come back as JSON. The script
reports whether the runs agree.

`node workflows/hear.mjs T9 T47 cases.txt` hears Tests by number (or `tests` for
every Test), and cases in files of `ID: scenario` blocks separated by blank
lines. Every result carries a hash of the law it was heard against, so results
from an older text can be told apart.

A Test with a settled answer carries a `**Question:**` and a task list of
answers, the expected one ticked (`- [x]`). The judges see the question with
lettered options and never the tick; the report marks each such case PASS,
MIXED, or FAIL and counts passes. Case files may instead end
`Ask: question? A) … B) …` and `Expect: choice=B`. Untested answers stay free
text, read by you.

To queue Hearings, add lines of hear.mjs arguments to `workflows/runs/queue.txt`
and run [drain.mjs](drain.mjs). It hears each line in turn, writing each report
and log as `runs/hear-<time>.txt` and `.jsonl`, and records each in
`runs/drained.txt`. It removes a line only once it is heard, so an interrupted
drain resumes where it stopped, and a second drain exits at once. A drain killed
mid-job leaves a stale `runs/queue.lock`: check no node process is running, then
delete it.

`node workflows/check.mjs [results.jsonl …]` (default: the latest) checks
results against the current law alone, with no model: cited provisions that
don't exist, quotes not found in the law, and provisions the reasoning leans on
without citing. Run it after each drain. Its flags are leads only (it can't see
case text, and uncited reliances are noisy), and it is only clean for runs heard
under the current law hash, which it marks `[other law]` otherwise.

## Residents

`node workflows/live.mjs residents` follows each Resident and Adversary in
[Regression Tests](../RegressionTests.md) (or `R1`, `A1`, or new ones in
`ID: text` block files) through a few years in Wroxia. Each year they say what
they try to do and expect, a clerk who sees only the law says what happens, and
they react. Residents never see the law. Adversaries don't either, but each year
their lawyer, a second character who knows the law, advises them first.

## Land simulator

[landsim/](landsim/) is a Monte Carlo model of Part V and the land charge
(excised 16 November; see commit daeca7d): a map whose desirability shifts as
towns grow, people who are born, migrate, and die, monthly draws, pools,
directions, starter plots, arrears, and switchable ways of avoiding the charge.
Open [index.html](landsim/index.html) in a browser, or run
`node workflows/landsim/sim.js <preset> [--runs N] [--years N] [--param value]`,
which prints a table per decade and writes JSON to `runs/`. Its rules are
hand-coded from the text, so update `sim.js` when Part V changes. Type-check it
with
`npx -y -p typescript tsc --noEmit --allowJs --checkJs --target es2022 --lib es2022,dom --noImplicitAny false workflows/landsim/sim.js`.

## Money simulator

[moneysim/](moneysim/) is an agent-based Monte Carlo model of the hearth beside
the haven (IV.2.2, IV.5.1.3), asking how much demurrage and other hearth-only
charges (a sales tax, a pollution charge, a poll tax) can raise: adults on a
trading network price in whichever currency costs them less, hold hearth only
for spending and whatever savings are cheaper there, and Nearlaw either pays a
fixed hearth wage or spends a target whatever hearth is worth. Open
[index.html](moneysim/index.html) in a browser, or run
`node workflows/moneysim/sim.js <preset> [--runs N] [--param value] [--sweep name=v1,v2]`,
which prints a table per decade, or per swept value, and writes JSON to `runs/`.
Update `sim.js` when IV.2.3 or IV.5 changes, and type-check it as above.

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
