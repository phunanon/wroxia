# Offline backend

The default backend: local models through llama.cpp's `llama-server`, with no
network. It starts a server for each model in turn, one call at a time, then
stops it. The law comes first in the prompt, so after the first call the server
reuses it from its prompt cache; a frontend should group calls that share the
law. The models are hybrid, so a cached prompt resumes only from a checkpoint,
which the server saves 516 and 4 tokens before the end of each prompt, and it
keeps recent prompts in RAM, so calls with and without the law can interleave.
Keep whatever follows the law (case and instructions, now at most about 480
tokens) under about 500 tokens, or every call reprocesses the whole law, about
two minutes. Replies are streamed, so a slow one never hits `fetch`'s 5-minute
timeout. Run hearings on an idle, awake machine: other heavy work starves
generation and pages the model in from disk.

```sh
node workflows/hear.mjs T9 T47 cases.txt
node workflows/hear.mjs --models qwen3.6-35b,qwen3.5-4b --runs 3 tests
```

## Models

| Name          | File                             | Notes                                                                                                                      |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `qwen3.6-35b` | `Qwen3.6-35B-A3B-UD-IQ4_XS.gguf` | Expert weights in RAM, the rest on the GPU. About 5 tokens/s; first prompt takes ~3 minutes, then about a minute a hearing |
| `qwen3.5-4b`  | `Qwen3.5-4B-Q4_K_M.gguf`         | 16 layers on the GPU. Fast but often wrong; second opinion only, not run by default                                        |

Both are run without thinking: thinking fixed some errors but took 11–12 minutes
a hearing. Expect the local pair to be weaker than the online pair; check their
answers more sharply.

To add a model, put its GGUF here and add an entry to `profiles` in
`backend.mjs`.

## Setup

Weights and the runtime are ignored by Git.

- `runtime/`: a Windows CUDA 12.4 build of
  [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) (b11960 tested),
  with its `cudart` DLLs extracted alongside `llama-server.exe`.
- Weights:
  [Qwen3.6-35B-A3B](https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF) and
  [Qwen3.5-4B](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) from Unsloth.
