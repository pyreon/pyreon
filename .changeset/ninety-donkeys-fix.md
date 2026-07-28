---
'@pyreon/mcp': minor
---

Serve the Atlas component catalog to AI agents: `get_atlas_catalog({ tag? })` returns the verified catalog `atlas scan` writes (props, allowed values, and per-component verified/failing/unverified scenario counts), and `get_atlas_component({ name })` returns prescriptive usage for one component — required and optional props with exact allowed values, which props need a signal accessor, a known-good example only when a check actually passed, and `avoid:` lines for real failures. An unverified example is labelled as such rather than presented as correct, and a missing catalog returns instructions to run `atlas scan` instead of a guess.
