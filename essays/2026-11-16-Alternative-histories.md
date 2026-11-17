# Alternative histories

16 November 2026, by Claude Fable. A design for testing the constitution on real
countries: small models drafting the law a country would need under it, enacting
that law through simulated years, and ordinary people asking each other what it
means for them. Nothing here is built. It extends the three workflows in
workflows/AGENTS.md and keeps their rule: whoever judges sees only the law.

## Why it is worth doing

Hearings test a sentence. Residents test a life. Neither tests whether a whole
society can be run under this text: whether the law a country needs can be
written at all within III.1.1, and what happens on the day everything changes
(P80). The author's third goal, that most people should not turn up their noses,
can only be tested on people with existing lives, mortgages, churches, farms,
and councils.

## Four stages, each useful alone

### 1. The forum

The cheapest, and the one the author dreams of. A town has just joined Wroxia,
and its people post on a local forum.

- **Posters** are written by a fresh agent that knows the town and its year but
  nothing of Wroxia: twenty people with homes, jobs, debts, families, animals,
  and worries. This is the blind-case rule applied to people, and it matters
  most here: a designer who writes the posters will write the problems they
  expect.
- **Each poster reads the Constitution, or does not.** It is short enough that
  some would. Give half the text, and half only rumours from the others.
- **They post questions about their own lives** and answer each other, rightly
  and wrongly. "I rent my flat. Is it mine now?" "Dad's in a care home paid by
  his pension fund. What happens?" "Can I still keep hens?"
- **A clerk who sees only the law** answers each thread last, as in Residents.
- **An analyst** lists every question the clerk could not answer, every answer
  that would horrify the poster, and every wrong belief that spread. Each is a
  candidate case or Problem.

One thread is a few thousand tokens. The offline model can write posts; the
clerk is a Hearing.

### 2. The statute book

A drafter that knows the constitution is given one need of one country ("road
traffic in the United Kingdom", "the National Health Service", "a land
registry") and writes the shortest ordinary law that meets it. Fresh models then
hear that law against the constitution, since a law contrary to it has no force
(III.1.5). Three outcomes, all findings:

- The law stands: keep it. The collected laws are that country's Wroxian statute
  book, and their length is a measure of how much the constitution leaves to be
  said.
- The law fails and was not needed: the constitution has deleted something. Note
  whether people would miss it.
- The law fails and is needed: the constitution blocks something a society
  cannot do without. This is the most valuable result the project can get.

### 3. Changeover day

Take a country's real institutions, one at a time, and ask what each becomes at
the moment the text takes effect: mortgages, tenancies, pension funds,
companies, prisons, farms and their animals, the army, the church, the crown,
local councils, existing debts. Each is a Hearing with the institution as the
case. P80 says mortgages and leases "simply end, with nothing owed"; this stage
finds every such cliff. See essays/2026-11-16-Districts-and-annexation.md for
what history says about them.

### 4. Years

The full dream. Posters become electors. Each simulated year:

1. Bodies are drawn by lot from them (Instrument 1), and they propose and pass
   law, in a Debate with a vote.
2. Each law is heard against the constitution. What fails is struck.
3. Everyone lives a year under what stands, as Residents do.
4. They score members facing reconfirmation, and the forum reacts.

The state carried from year to year is small: the statute book, who sits where,
and a paragraph on each life. Small models can do each step; the difficulty is
drift, not computing. Start with one village for five years before a nation for
fifty.

## What it can and cannot show

It can show: law that cannot be written; institutions with no place to land;
questions with no answer; what people fear before they understand; how the text
reads to someone with a stake.

It cannot show: prices, wealth, or growth, which are the simulators' job; or
real politics. Language models are more agreeable and more reasonable than
people, so a simulated assembly reaching consensus proves little. Count its
failures and discount its successes. Give some posters bad faith, as Adversaries
have.

## Which places

Variety matters more than number. A place the author knows (a Welsh or English
town); a federal country (the United States); a poor, young, farming country
(Burkina Faso); a country of renters (Germany) and one of owners (Romania); a
monarchy with an established religion; an island of a few thousand. And one that
is no country at all: forty people who buy a farm and start (the micronation
path).

## Order of work

1. Forum, one town, by hand with the print backend, to see whether the threads
   find anything Hearings have not.
2. Changeover day for that town's country, as ordinary cases.
3. Statute book, ten needs.
4. Years, only if the first three keep paying.
