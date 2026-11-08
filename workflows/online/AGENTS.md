# Online hearings

`hear.mjs` sends each case to fresh, tool-less Copilot CLI sessions: by default
twice to `claude-haiku-5.5` and twice to `gpt-6-luna`, eight calls at a time. A
call takes 10–20 seconds; a Haiku call costs about 0.2 AIU.

```sh
node workflows/online/hear.mjs T9 T47 cases.txt
node workflows/online/hear.mjs --models gpt-6-luna --runs 3 tests
```

## Isolation

Each call runs in an empty directory under `%LOCALAPPDATA%\wroxia-arbiter` with
its own `COPILOT_HOME`, so it sees no repository, memory, custom instructions or
MCP servers. Every built-in tool is excluded by name, because an empty
`--available-tools` does not remove them; a run that still calls a tool fails. A
model asked to list its tools may invent some; trust the run's events, not its
claims.

## Setup

Needs the Copilot CLI at `%LOCALAPPDATA%\GitHubCopilotCLI\copilot.exe`, logged
in once with the isolated home:

```powershell
$env:COPILOT_HOME = "$env:LOCALAPPDATA\wroxia-arbiter\home"; copilot login
```

If a CLI update adds a tool, add its name to `tools` in `hear.mjs`.
