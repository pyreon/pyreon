---
"@pyreon/mcp": patch
---

fix(mcp): `pyreon-mcp` starts on Node 20/22 LTS (was a silent no-op there)

The stdio server was gated on `import.meta.main` alone, which Node only
defines from v24.2 (it's `undefined` on 20/22 LTS) — so `npx pyreon-mcp` under
Node LTS started nothing and exited silently (it worked under Bun/`bunx`, which
masked it). The entry check is now cross-runtime: it uses `import.meta.main`
when it's a boolean, else falls back to comparing the resolved process-entry
URL to the module URL. The comparison is a pure exported helper
(`matchesProcessEntry`) so the LTS path is unit-tested without an old Node.
