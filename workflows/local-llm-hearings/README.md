# Local Hearings

Windows llama.cpp and Qwen3-4B, with input-only KV snapshots on disk. Node.js
22+ is the only runner dependency. The arbiter has no tools or repository
access. Do not treat this model as calibrated until its rulings have been
reviewed.

## Start

From the repository root, in a terminal:

```sh
node workflows/local-llm-hearings/hearings.mjs serve
```

Wait for `listening on http://127.0.0.1:8087`. The local web interface is at
that address, but do not use it while a batch is running: there is only one
slot. Stop the server with Ctrl+C. It uses no cloud API and exposes no agent
tools.

The launcher expects the model beside this README and extracted binaries in
`runtime/`. Model, archives, runtime and caches are ignored by Git. Keep the two
downloaded CUDA ZIPs: their contents were extracted into the same runtime
folder.

Experimental sessions under `hearings/` and `placement-benchmark.json` are
also ignored by Git and retained locally. The result paths below refer to
local evidence, not files included in a fresh checkout. To version a reviewed
session, add an explicit exception in `hearings/.gitignore`; do not force-add
all experimental outputs.

## Calibration

In a second terminal:

```sh
node workflows/local-llm-hearings/hearings.mjs calibrate --session 001-calibration-smoke --cases 0,1,9 --runs 3
```

Case indices are zero-based, matching the archived docket's rulings keys. This
uses the third Hearings' original constitution and arbiter prompt, not today's
constitution. Only the scenario is taken from each docket entry. Expectations,
country labels and previous rulings are never sent to the model.

Repeat exactly the same command to resume. Each completed run is saved
atomically and skipped on resumption, including any recorded invalid or
truncated response. Changed prompts, selected cases, run counts, model, template
or settings require a new numbered session. For the full docket, use a fresh
session:

```sh
node workflows/local-llm-hearings/hearings.mjs calibrate --session 002-calibration-full --runs 3
```

Results go to `hearings/<session>/`: `manifest.json` records exact formatted
prompts, hashes, source Git status, runtime and settings; `constitution.md`
records the judged text; each run records seed, raw response, timings and
validation; `summary.json` compares the three decision fields with historical
rulings. Decision matches are not correctness scores. Review articles, reasoning
and gaps as well. If historical source files have uncommitted changes, their
hashes, rather than HEAD alone, identify the calibration text.

The initial baseline disables thinking through the model's chat template, uses
Qwen's recommended non-thinking sampling settings and allows 1,024 output
tokens. Truncation is recorded as an error, never a successful judgement. A
larger context or a thinking-mode experiment needs separate memory checks and a
new session.

## Cache Persistence

The runner saves a shared constitution prefix and a complete input snapshot for
each case, before generating anything. Every run restores a clean case snapshot
and sets a different recorded seed. Both cache levels survive server restarts.
The model weights must still load after a restart; KV snapshots only skip prompt
processing, not answer generation.

Cache filenames are hashes of the exact formatted input and runtime identity. Do
not move snapshots between model/runtime configurations. `cache/server.log`
contains GPU allocation details. `cache/server.json` records the last launcher.
Cache files are disposable but can be large: complete case snapshots each
include the constitution. Cache loss does not erase session results.

To test save/erase/restore independently of arbitration:

```sh
node workflows/local-llm-hearings/hearings.mjs probe
```

Restart the server, then run:

```sh
node workflows/local-llm-hearings/hearings.mjs probe-restore
```

Both commands require actual cached-token reuse. Seeds improve repeatability but
do not guarantee bit-identical output across hardware, runtime or batch changes.

Ctrl+C stops a batch; restart the server too if a request remains active. After
an unclean termination, `cache/runner.lock` can remain. It contains the runner
PID; remove it only after confirming that runner has ended. Never run two
batches or use the web UI concurrently. No automatic retries hide failed
judgements.

## Checks

```sh
node --test workflows/local-llm-hearings/hearings.test.mjs
```

The initial profile is 4,096 context tokens, full GPU layer offloading, f16 K/V,
Flash Attention, 256-token batches, 128-token microbatches and six CPU threads.
The launcher binds only to loopback with localhost CORS. Port 8080 was already
in use; 8087 was selected instead. `HEARINGS_URL` can change the port, but must
be set consistently for launcher and runner. Pin the runtime build during
calibration.

## Initial Smoke Results

Session `001-calibration-smoke` completed nine valid, untruncated rulings across
cases 0, 1 and 9, with three seeds each. Repeating the command skipped all nine
completed results. All 37 model layers and the KV cache were on the GPU;
measured steady GPU usage was about 3.0 GB. Output ran at 4.0-8.8 tokens/s, with
individual rulings taking 18-56 seconds to generate. Case snapshots restored in
140-303 ms. A separate probe verified cached-token reuse after a full server
restart.

The clear breach matched all three historical decision fields in every run. The
gum-sale case matched outcome and forbiddability but differed on jurisdiction
(local: nearlaw; historical: unclear). The public-wall case was called breach
and forbiddable in all three local runs, while both historical rulings were
unclear. This verifies the machinery, not arbiter competence: the model was
consistently more definite on a known ambiguity. Keep the stronger-model review
gate.

## Reasoning Experiments

The launcher now accepts a model filename, context size and K/V cache type. The
original defaults remain unchanged. After stopping the previous server, the
installed 2026 candidate can be started with:

```sh
node workflows/local-llm-hearings/hearings.mjs serve --model Qwen3.5-4B-Q4_K_M.gguf --context 8192 --cache-type f16
```

Its screening command is:

```sh
node workflows/local-llm-hearings/hearings.mjs calibrate --session 003-qwen35-thinking-screen --cases 0,1,9 --runs 1 --thinking --thinking-tokens 4096 --temperature 1.0
```

Thinking is generated without a JSON grammar until the model emits `</think>`.
Only then does a second continuation constrain the final answer to the ruling
schema. Both raw responses are retained in the run record. A reasoning response
that exhausts its budget produces an error, not a forced judgement. No generated
reasoning or ruling is saved into a reusable input snapshot. HTTP requests use
an explicit 30-minute deadline, not Node fetch's shorter response-header
timeout.

The 4,096 thinking-token cap plus 1,024 answer tokens fits the screened inputs
in 8,192 context tokens. This is a hardware-constrained test, not the models'
full recommended reasoning budget. Increasing it requires a fresh session and
context capacity check. The original Qwen3 uses temperature 0.6 for thinking;
Qwen3.5 uses 1.0 for general thinking, following their respective model cards.

The original-model thinking screen is `002-qwen3-thinking-screen`: case 9, one
seed, 8K context, q8_0 KV, 4,096 thinking tokens. It finished in about 320
seconds and changed the public-wall decision from breach to no breach, rather
than matching the historical uncertainty. That is not evidence of improvement.

## Candidate Models And Method

- [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) is a 2026
  hybrid-attention model, not merely a new quantisation of Qwen3. Its
  [Unsloth Q4_K_M GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) is
  installed here (2,740,937,888 bytes; SHA-256
  `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`). The
  vision projector was not downloaded; these are text-only hearings.
- [Qwen3-4B-Thinking-2507](https://huggingface.co/Qwen/Qwen3-4B-Thinking-2507)
  is a July 2025 reasoning-specific alternative. It is not installed. Its long
  recommended outputs make it less attractive for the first hardware screen.
- Model-card benchmark improvements are reasons to test, not evidence that a
  model can interpret Wroxia. A GGUF's upload date alone does not establish its
  underlying model's age or quality.
- [SmolLM3-3B](https://huggingface.co/HuggingFaceTB/SmolLM3-3B) is a smaller
  alternative with switchable reasoning and published training details. It is
  not installed or tested here; a different family could be a useful comparison
  if Qwen3.5's speed or systematic errors are unacceptable.

Do not run a full old-model calibration before screening the newer candidate.
These are exploratory comparisons: model, context, KV precision, sampling and
reasoning differ. They cannot isolate the effect of thinking. For the selected
model, compare thinking and non-thinking on the same server profile, then hear
the full archived docket with at least three seeds. Reserve fresh cases or
paraphrases for validation after selecting settings. Review invented
assumptions, missed clauses and unsupported certainty, not just historical
decision matches.

Separate "paralegal" passes are a proposed experiment, not implemented here.
Prefer specific examiners over personas: one maps facts to relevant clauses;
another checks exceptions, competing readings and missing facts. Each receives
the full constitution and the same case, with no expected outcomes. A final
arbiter would receive their findings as untrusted claims, verify citations and
retain disagreements. This is a distinct protocol from the blind baseline.
Compare it with direct reasoning at a similar total token budget: multiple calls
to the same model share blind spots and can amplify mistakes, not only catch
them. Keep stronger-AI review regardless of which local protocol performs best.

## Placement Benchmark

On 4 November 2026 the hearing batch and server were stopped before running
llama-bench sequentially on Qwen3.5-4B Q4_K_M. Each configuration used warm-up,
two repetitions, 2,048 tokens of context depth, a 512-token prompt test and a
64-token generation test, f16 K/V, Flash Attention, 256-token batches and
128-token microbatches. Raw measurements are retained in
the local-only `placement-benchmark.json`.

| Placement                    | CPU threads | Prompt tokens/s | Generated tokens/s |
| ---------------------------- | ----------: | --------------: | -----------------: |
| CPU only                     |           6 |           31.34 |               6.63 |
| CPU only                     |          12 |           30.55 |               7.15 |
| 16 GPU layers, remainder CPU |           6 |           98.46 |               9.25 |
| All layers on GPU            |           6 |          111.81 |               4.33 |

The mixed profile was about 2.1 times faster at generation than full GPU in this
short test. This is not an exhaustive placement search or a guarantee of
sustained hearing speed. The CPU thread-count samples overlap; twelve threads
were not conclusively better than six. No power settings were changed. The
driver reports power capping, and changing the limit through nvidia-smi is not
supported even with administrator privileges.

For the mixed profile, use this rather than the original baseline launch above:

```sh
node workflows/local-llm-hearings/hearings.mjs serve --model Qwen3.5-4B-Q4_K_M.gguf --context 8192 --cache-type f16 --gpu-layers 16 --threads 6
```

CPU-only execution is available with `--gpu-layers 0 --threads 12`; the launcher
then explicitly selects device `none`. Original launch defaults are unchanged.
Placement and thread count are included in cache and session identity, so use a
fresh session rather than resuming a differently configured hearing.

The direct-answer screen on the mixed profile uses:

```sh
node workflows/local-llm-hearings/hearings.mjs calibrate --session 004-qwen35-direct-mixed --cases 0,1,9 --runs 1
```

The earlier reasoning session `003-qwen35-thinking-screen` was paused: cases 0
and 1 each exhausted 4,096 thinking tokens without a judgement; case 9 was
interrupted, not completed. Its two recorded failures and input caches remain
intact. This shows the capped reasoning protocol is impractical here, not that
the model lacks reasoning capability. Do not silently resume that long batch.

### Live Hearing Controls

The synthetic ranking was checked against direct JSON hearings on archived case
0 with seed 1001, identical 2,175-token inputs, 8K f16 context and the same
sampling settings. Each placement was heard once, so these are indicative, not
statistically established speed differences. Outputs differed in length and
content; numerical changes across backends can alter seeded sampling.

| Placement                 | Session                       | Generated tokens/s | Generation time |
| ------------------------- | ----------------------------- | -----------------: | --------------: |
| CPU only, 12 threads      | 006-qwen35-direct-cpu-control |               3.74 |         64.93 s |
| 16 GPU layers, 6 threads  | 004-qwen35-direct-mixed       |               4.82 |         43.38 s |
| All GPU layers, 6 threads | 005-qwen35-direct-gpu-control |               4.38 |         49.78 s |

The mixed screen also completed cases 1 and 9 at 5.38 and 6.05 tokens/s. All
three outputs were valid JSON, but not a competence pass: case 1 marked the sale
forbiddable while its own reasoning said Article 4.2 prevents forbidding it;
case 9 also confused provisions and reached a definite answer on the known
ambiguity. Faster execution does not repair these errors.

The mixed profile remains the practical starting point, not a proven optimum.
The large synthetic generation advantage did not carry over to the live JSON
workflow. No calibration batch is left running; the mixed server is idle and
available at http://127.0.0.1:8087. Keep long reasoning paused and stronger-AI
review mandatory.

## Mixture-Of-Experts Screen

On 4 November 2026, [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)
was installed as Unsloth's
[UD-IQ4_XS GGUF](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF)
(17.7 GB; SHA-256
`649d7508507b84638732c4f52c24c8b15843c6dca2f3ff793ae07c14a67ebbb3`). It has 35B
parameters but uses about 3B per token. Q4 files were not chosen because they
left little RAM headroom alongside other applications.

```sh
node workflows/local-llm-hearings/hearings.mjs serve --model Qwen3.6-35B-A3B-UD-IQ4_XS.gguf --context 8192 --cache-type f16 --gpu-layers 99 --cpu-moe 99 --threads 6
```

`--cpu-moe N` keeps the expert weights of the first N layers in system RAM, with
attention, shared weights, KV cache and recurrent state on the GPU (about 2.5 GB
VRAM in total). It is recorded in cache and session identity only when used.
Moving a few expert layers onto the GPU has not been tried. Generation measured
3.7-6.9 tokens/s, comparable to the 4B model; prompt processing was about 11
tokens/s, so building the shared constitution cache took about 3 minutes. That
cost is what disk snapshots avoid after a restart.

### Screening Set

Cases 0, 1, 9, 14, 16, 19, 21 and 23 cover a clear breach, a clear non-breach,
a known ambiguity (P3), a law as the breach, jurisdiction, a literal reading
against intuition (T7), a counter-intuitive breach (T13) and consent voided by
deception (T16). The arbiter still sees only the scenario. A stronger model
reviewed each ruling's substance against the archived constitution and the
docket's expectations:

| Case              | 007 Qwen3.5-4B direct    | 008 Qwen3.6-35B-A3B direct     | 009 35B thinking |
| ----------------- | ------------------------ | ------------------------------ | ---------------- |
| 0 armed robbery   | Pass                     | Pass                           |                  |
| 1 chewing gum     | Fail: self-contradiction | Fail: misreads 4.2             | Pass             |
| 9 public wall     | Fail: invents rules      | Partial: breach, flags the gap |                  |
| 14 encryption     | Fail                     | Pass, minor miscitation        |                  |
| 16 diplomat       | Fail: farlaw             | Pass                           |                  |
| 19 coroner        | Fail                     | Partial: forbiddable wrong     |                  |
| 21 healthy cattle | Fail                     | Fail: misses 1.5 and 2.3       | Budget exhausted |
| 23 bank scam      | Partial: wrong route     | Fail: voids consent, no breach | Pass             |

Thinking was heard only for the direct-mode failures; blank cells were not run.
In case 19 the 35B model correctly held that 1.4 blocks the coroner.

The 35B model is clearly better than the 4B, but not yet qualified. Its main
direct-mode error is marking acts that breach nothing as forbiddable. The runner
now records a review warning for that combination (`warnings` in each run and
in `summary.json`); it is not an automatic rejection, because when the act is
itself a law the question can be read differently.

Thinking fixed both cases it finished, and case 23 matched T16 where the
historical ruling was unclear. Each thinking hearing took 11-12 minutes, mostly
reasoning at about 6 tokens/s; much of the budget went on drafting and
re-checking the JSON inside the reasoning. In case 21 the model considered 2.3,
then treated the privilege as unsettled because its only condition is marked
[Open]. That is worth noting as a possible reading of [Open] markers, not just a
model error.

At this speed, the full docket with three runs would take about 19 hours of
thinking. Candidate next steps, each as its own session: a separate-protocol
prompt asking for brief reasoning without drafting the JSON; multi-token
prediction (Unsloth also publishes an MTP GGUF, untested here); and placing
some expert layers on the GPU.

## Offline, MTP And Online Arbitration

Next offline experiment: benchmark MTP against ordinary decoding using the same
weights and prompts, including cache restoration across a restart. This is
deferred while we try the [Luna workflow](../luna-hearings/README.md); no MTP
download or run is authorised merely by this note.

The directory was renamed from `apps` to `workflows`. Historical manifests and
local cache metadata retain their original paths as evidence; start a fresh
server after the move to write current launcher paths. Do not edit old results
to make their paths look current.

The local runner remains offline once weights are downloaded. It gives direct
control over prompt inputs, seeds, runtime identity and disk snapshots, but the
35B thinking screen takes 11-12 minutes per hearing and still fails some cases.
At 37p/kWh, a 12-minute hearing costs 0.74-1.11p at an assumed whole-machine
draw of 100-150 W. This is an illustration, not a wall-power measurement; GPU
power alone is not the laptop's consumption. A 19-hour batch would cost about
GBP 0.70-1.05 at those assumed draws, excluding setup and analyst time.

[Multi-token prediction](https://unsloth.ai/docs/models/mtp.md) drafts tokens
and verifies them with the main model. Unsloth reports roughly 1.4-2.2x gains on
its benchmarks and about 2 GB of extra memory headroom. Neither number is
verified on this CPU-heavy laptop configuration. The installed runtime exposes
`--spec-type draft-mtp` and `--spec-draft-n-max`, but the launcher has no MTP
profile yet and the MTP weights have not been downloaded. A proper experiment
must record draft configuration, acceptance rate, total generation time,
memory use and cache restoration across restarts. It should not be assumed to
improve reasoning quality, reproduce seeded output exactly or fit in 4 GB of
VRAM just because the ordinary model does.

An online `gpt-6-luna` sub-agent was tried on the healthy-cattle case, without
expectations or earlier rulings. Its unmodified answer and the limitations are
in the local-only `hearings/010-luna-single-case/trial.json`. It considered
the relevant animal protections and answered unclear, but did not meet T13's
expected breach and produced a malformed citation. This is not a competence
pass or a matched prompt comparison. A fresh general-purpose agent was
instructed not to use tools; tool access was not technically disabled. For
production arbitration, prefer fresh requests with an explicit input-only
constitution/case prompt, tools disabled and no conversation history.

[GitHub's published default-context rates](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)
on 4 November 2026 list GPT-6 Luna at USD 0.10 per million input tokens and
USD 0.50 per million output tokens, with separate cache rates. Illustratively,
3,000 input and 4,000 output tokens cost USD 0.0023 before cache charges and any
additional agent context. The user subsequently reported that the Luna session
cost 0.5 credits, equivalent to USD 0.005 at GitHub's published conversion. This
is a reported session charge, not a measured token breakdown or a guaranteed
price for future cases. No speed-up factor is claimed. Include billable
reasoning, agent overhead, plan allowances and currency conversion when
comparing costs.

Recommended next calibration candidate: online Luna on the existing eight-case
screen, then repeated runs and held-out cases if it passes. Keep offline MTP as
a separate optional throughput experiment rather than a prerequisite for
testing a stronger arbiter. The local server was no longer listening when this
review began; no batch or server was started for the online trial.

### Drafting Markers

The live constitution has no drafting markers. It states no condition on
confinement or leaving Wroxia, and no conditions on public speech and
broadcast; the privileges remain waivable under Part I. The length of an
Advocate's fixed term is unspecified. The unresolved choices remain in Parked
Problems: confinement under P11/P46, speech conditions under P18 and Advocate
terms under P17. Test T25 has not yet been heard against the no-condition text.
Historical constitutions, rulings and caches remain unchanged.
