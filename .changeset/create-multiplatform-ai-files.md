---
"@pyreon/create-multiplatform": minor
---

The multi-platform scaffold now ships AI-agent files, matching `create-zero`: `AGENTS.md` and `CLAUDE.md` (the project's commands, the native-subset rules, and where the capability matrix lives) and a `.mcp.json` that registers the Pyreon MCP server. A spec ties every `bun run <script>` named in the instructions to the scripts in the generated `package.json`, so the guidance cannot drift from the scaffold.
