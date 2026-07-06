---
"@pyreon/cli": minor
---

Add `pyreon mcp` — launch the Pyreon MCP server from the unified CLI. A thin, dependency-free delegator that `npx`-runs `@pyreon/mcp` (the stdio Model-Context-Protocol server serving Pyreon's API reference / patterns / `validate` / `diagnose` to AI coding assistants). Deliberately **not** pinned to `@latest`: it prefers the project-local `@pyreon/mcp` when installed, so the served API reference matches your installed Pyreon version, fetching on demand only when absent. Extra args and `--dry-run` pass through; it inherits stdio so the spawning AI client talks to the server directly.
