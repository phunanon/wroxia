<p align="center"><img src="Wroxia.svg" alt="Flag of Wroxia" width="312"></p>

# Wroxia

A constitution for a hypothetical country, kept short enough for everyone it
governs to understand and navigate.

## Material

- [The Constitution](Constitution.md), and its [Instruments](Instruments.md):
  the procedures its articles share.
- [Beliefs](Beliefs.md): what I want the constitution to deliver.
- [Roadmap](Roadmap.md): what a constitution needs, and how far each part has
  come.
- [Essays](essays/): AI written design notes and research.

## Workflow

Known problems with the constitution are meticulously [tracked](Problems.md),
and once resolved are deleted (preserved in git history). Resolution is not
complete without verification that the new text does not violate a suite of
[regression tests](RegressionTests.md), and that hearings of fictional cases all
hold as expected. Hearings are conducted using LLMs that know nothing but the
law to judge a case. Multiple hearings are conducted - a split means the text is
unclear, and agreement on the wrong answer means it is wrong. LLMs are also used
to simulate fictional residents who live a few years under the law without
reading it, either trying to live a good life, or as an adversary to test the
law.

Released under [CC0](LICENSE).
