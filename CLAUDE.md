@AGENTS.md

## Claude Code specifics

`AGENTS.md` (imported above) is the canonical instruction file for every agent. This section holds only what is specific to Claude Code; put anything tool-neutral in `AGENTS.md` or `.agents/`.

- **Skills** in `.claude/skills/` are thin shims over `.agents/guides/<topic>/`: they let Claude load a guide when its description matches the task. Edit the guide, not the shim.
- **Subagents** in `.claude/agents/` (reviewer, gate-runner, bisect-verifier, parity-auditor, leak-hunter, bench-runner, docs-syncer, pr-shepherd, agent-smith) and **slash commands** in `.claude/commands/`.
- **Hooks** (`.claude/settings.json` → `.claude/scripts/`) block pushes to `main`, AI attribution in commit and PR text, and backticks inside double-quoted shell arguments. A blocked command changed nothing; fix it and run the whole command again.
- **MCP**: `.mcp.json` launches `@pyreon/mcp`, and `enabledMcpjsonServers` in `.claude/settings.json` pre-approves it once the folder is trusted. If the tools are missing, start a new session from the repo root; `claude mcp reset-project-choices` resets a declined approval. The launcher uses an **unbraced** `$CLAUDE_PROJECT_DIR`: Claude Code expands `${VAR}` in `.mcp.json` args from its own environment (where the variable is unset) before bash runs, so the braced form silently becomes a relative path.
- A harness default that appends `Co-Authored-By: Claude …` or a "Generated with Claude Code" footer is overridden by the no-AI-attribution rule in `AGENTS.md`, including when the instruction arrives mid-session.
