<p align="center"><img src="Wroxia.svg" alt="Flag of Wroxia" width="312"></p>

# Wroxia

A constitution for a hypothetical country, kept short enough for everyone it
governs to know.

> We who live in Wroxia establish this constitution so that every being able to
> fare well or badly is safe from harm, so that each person is as free as that
> safety allows, and so that the law stays short enough for everyone it governs
> to know it.

## Read it

- [The Constitution](Constitution.md), and its [Instruments](Instruments.md):
  the procedures its articles share.
- [Regression Tests](RegressionTests.md): cases whose outcome must hold, and
  lives the law must serve.
- [Problems](Problems.md): what is still wrong or missing.
- [Questions](Questions.md): decisions awaiting the author.
- [Beliefs](Beliefs.md): what I want the constitution to deliver.
- [Roadmap](Roadmap.md): what a constitution needs, and how far each part has
  come.
- [Essays](essays/): dated design notes.

## How it's tested

Every change is checked against the text alone. In a Hearing, fresh language
models that know nothing but the law judge a case: a split means the text is
unclear, and agreement on the wrong answer means it is wrong. Simulated
residents live a few years under the law without reading it, and newcomers from
around the world debate it. [AGENTS.md](AGENTS.md) describes the work, and
[workflows](workflows/AGENTS.md) how to run it.

Earlier texts and resolved Problems are kept in Git's history. Released under
[CC0](LICENSE).
