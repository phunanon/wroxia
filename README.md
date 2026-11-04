# Wroxia Constitution Project

## Files

- [The Constitution](<constitution/Constitution of Wroxia.md>), with its
  [Instruments](<constitution/Constitution of Wroxia - Instruments.md>) and
  [Regression Tests](<constitution/Constitution of Wroxia - Regression Tests.md>)
- [Parked Problems](<artefacts/Wroxia parked problems.md>)
- `artefacts/*-hearings/`: the first three Hearings, run on claude.ai. Each
  `index.html` holds the clerk and arbiter prompts and the constitution text it
  judged; `data/dockets/` holds its cases and rulings.
- [Luna Hearings workflow](workflows/luna-hearings/README.md): case design,
  blind cases, independent arbitration and analysis in a fresh session.
- [Local Hearings runner](workflows/local-llm-hearings/README.md): setup, persistent
  KV caches and resumable calibration.
- `hearings/`: saved local Hearings and online arbiter trials, one numbered
  folder per session. Experimental outputs are kept locally and ignored by
  Git. Versioning a reviewed session requires an explicit ignore-rule exception.

## Workflow

1. Add Problems to Parked Problems.
2. Attempt to resolve a number of Problems by modifying the Constitution.
3. Write cases that exercise those Problems (Claude), and optionally gather
   blind cases from real-world crimes (the clerk).
4. Undertake a Hearings session: the arbiter hears every new case and every
   Regression Test, several times each, with only the Constitution to go on.
   Record the commit hash of the Constitution it judged.
5. Analyse the rulings (Claude):
   - Check every Regression Test still holds, and update its **Status**.
   - Record successful new cases as Regression Tests.
   - Add new Problems to Parked Problems.
   - Remove resolved Problems from Parked Problems.

Disagreement between runs of the same case is the signal that the text is
unclear.

## Roles

| Role                               | Who                           | Why                                                                                        |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Arbiter                            | Isolated local or online LLM  | Must know nothing but the Constitution and case; hear each case 3–5 times and record usage |
| Clerk, blind cases                 | Local LLM or Claude sub-agent | Must know nothing about Wroxia                                                             |
| Targeted cases, analysis, drafting | Claude                        | Design work that needs the project's history                                               |

TEMPORARY NOTE: Before trusting the local arbiter, calibrate it: rehear the
third Hearings' cases against the same Constitution text and compare with the
stored Claude rulings. Where they diverge, the final check before a change lands
stays with Claude.
