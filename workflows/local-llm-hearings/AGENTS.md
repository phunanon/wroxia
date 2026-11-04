# Local Hearings

Follow the root README.md and CLAUDE.md. This directory owns the local inference
runtime and batch runner, not constitutional drafting.

- The arbiter receives only its instructions, the chosen constitution and one
  scenario. Never send expectations, country labels, problem notes, stored
  rulings or earlier hearings to it. Do not give it tools or repository access.
- Calibration uses the constitution and arbiter prompt embedded in
  artefacts/third-hearings/index.html, not the current constitution.
- Cache only input prompts, before any generated reasoning or ruling. Restore a
  clean cache for every independent run and pass an explicit sampling seed.
- Record exact prompts, source commit and hashes, model hash, runtime build,
  template, cache settings and sampling settings. Treat KV files as disposable,
  configuration-specific accelerators; retain raw responses as evidence.
- Do not alter the Constitution, Parked Problems or Regression Tests as part of
  runtime setup or calibration. Do not stage, commit or push.
- Keep downloaded archives, model weights, extracted binaries and KV caches out
  of Git. Do not delete incomplete downloads without permission.
- Hardware: i7-10750H (6 cores/12 threads), 64 GB RAM, Quadro T1000 Max-Q with 4
  GB VRAM. Verify actual GPU offloading and memory use, not just model size.
- The terminal is Bash on Windows. Use powershell.exe -NoProfile -Command '...'
  for Windows queries; single quotes prevent Bash expanding PowerShell
  variables.
- Commands and recovery steps are in this directory's README.md. Use Node.js;
  there are no npm dependencies. Run node --test on hearings.test.mjs after
  edits.
- llama.cpp b11960 (8642541b2), Windows CUDA 12.4, and Qwen3-4B Q4_K_M are
  installed here. All 37 layers and the f16 KV cache were verified on the T1000
  at 4,096 context tokens. Port 8087 is used because 8080 was occupied.
- Disk cache save/erase/restore and reuse across a server restart were verified.
  Do not assume changing batch settings preserves bit-identical results.
- Initial nine-run smoke calibration and resumption passed mechanically. It is
  not a competence pass: case 9 was consistently definite where historical
  rulings were unclear. Preserve the stronger-model review gate and raw
  evidence.
- Qwen3.5-4B Q4_K_M is also installed and hash-verified. At 8K f16 context all
  33 layers, 256 MiB KV and 50.25 MiB recurrent state are on the GPU. Its cache
  probe reused 412/416 tokens after disk restoration. Read the local README for
  the model filename, hash and launch command; do not assume baseline defaults
  select this model.
- Thinking is a two-stage continuation, unconstrained until natural </think> and
  then constrained JSON. Preserve both raw responses; token exhaustion is an
  error. Never persist generated thought or findings into clean input caches.
- Node fetch's independent five-minute header timeout interrupted a hearing
  while the server remained alive. Use the existing node:http transport and its
  explicit deadline for long reasoning requests.
- Session 002-qwen3-thinking-screen changed case 9 to definite no breach, not a
  calibration pass. Check session 003-qwen35-thinking-screen for modern-model
  results. Screens with different model/cache/sampling settings do not isolate
  the effect of thinking. Examiner decomposition is proposed, not implemented.
- Check free disk before full-docket cache creation: snapshots occupy hundreds
  of MB per case, and the drive was already low on space. Do not remove earlier
  evidence, model weights or caches without permission.
- Placement results are in placement-benchmark.json and the local README.
  Synthetic tests favoured 16 GPU layers/6 threads; a matched direct hearing
  measured mixed 4.82, full GPU 4.38, CPU-only/12 threads 3.74 tokens/s. Do not
  generalise the synthetic 2.1x advantage to live JSON hearings.
- The launcher accepts --gpu-layers and --threads. CPU-only (0 layers)
  explicitly selects device none. Original defaults remain unchanged; use a new
  session after placement changes. The current mixed launch is documented in
  README.md.
- Session 003 was paused after two budget-exhausted cases; its third case is
  incomplete. Sessions 004-006 are direct-answer screens/placement controls, not
  successful calibration. Case 1 in 004 contradicts its own forbiddability
  reasoning. Do not resume a long batch or trust these rulings automatically.
- Qwen3.6-35B-A3B UD-IQ4_XS (mixture of experts, ~3B active) is installed and
  hash-verified. Launch it with --cpu-moe 99 so experts stay in RAM; see the
  README's Mixture-Of-Experts Screen. It beat Qwen3.5-4B on the eight-case
  screen (sessions 007/008) but is not qualified. Thinking (009) fixed cases 1
  and 23 but takes 11-12 minutes per hearing; case 21 exhausted 4,096 tokens.
- Screening set: cases 0,1,9,14,16,19,21,23. Compare new models or protocols
  on it before any full-docket calibration. Runs now carry review warnings for
  "no breach but forbiddable"; these are flags, not rejections.
- Session 010 is an exploratory online gpt-6-luna hearing, not a local-runner
  session or a competence pass. Read trial.json for input isolation and
  measurement limits. Do not silently correct its malformed citation.
- hearings/.gitignore excludes all experimental session outputs by default;
  placement-benchmark.json is also local-only. Preserve them on disk. Version
  reviewed sessions only when asked, using an explicit ignore-rule exception.
  Do not stage, unstage or delete results without permission.
- MTP is researched, not installed or benchmarked. Do not claim advertised
  throughput gains apply here. See README for the offline/online cost comparison
  and the current treatment of drafting questions. Historical hearing texts and
  rulings must remain unchanged.
