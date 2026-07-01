---
'@pyreon/mcp': minor
---

feat(mcp): `explain_reactivity` tool — the compiler's per-expression reactivity verdict for AI agents

New MCP tool `explain_reactivity({ code, filename? })`. The Pyreon compiler already decides, while emitting codegen, whether each JSX expression is reactive or baked static — this surfaces that ground truth (via `analyzeReactivity`) so an AI coding agent sees the map BEFORE it commits. Every expression is classified `live` / `live prop` / `live attr` / `baked once` / `hoisted static`, merged with the `detectPyreonPatterns` footguns, over an annotated source view.

Where `validate` reports *bugs*, `explain_reactivity` reports the whole *map*: an agent sees that `<div>{qty}</div>` (from destructured props) compiled to `baked once` (dead) right at the source — so it can't ship the stale-closure / destructured-props / static-when-meant-reactive bug even when no footgun fires. The reactivity "type-check" surface for agents.

Brings the MCP server to 17 tools (15 manifest-listed).
