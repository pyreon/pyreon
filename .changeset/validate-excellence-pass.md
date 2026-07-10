---
'@pyreon/validate': minor
'@pyreon/compiler': patch
'@pyreon/mcp': patch
---

`@pyreon/validate` excellence pass — async-composition correctness, a fuzz-found `.catch` bug, JSON Schema emit, and a valid-path perf sweep that wins back the scalar-email benchmark row.

**Fixes (all bisect-verified, locked by three JIT↔interpreter differential fuzz suites):**

- Async members (`.refine(async)` / `.transform(async)` / registered `.serverCheck`) now work inside EVERY composition — `union`, `discriminatedUnion`, `intersection`, `map`, `set`, `record`, `tuple` previously hard-errored "async member in sync parse" even under `parseAsync` (and Map/Set silently DROPPED async entries). A sync `parse()` of an async tree now reports the one canonical "use parseAsync" issue at the root.
- The runtime JIT is async-aware: an async fallback subtree defers onto a pending list the root return awaits (previously any Promise from a fallback hard-errored — `parseAsync` was broken for JIT'd objects with async-refine fields). `serverCheck` no longer disqualifies a tree from the JIT.
- **`.catch` no longer eats sibling issues under `parseAsync`** (fuzz-found): the catch window snapshotted the shared ctx's issue count across an await, so a concurrent sibling failure could misfire the fallback AND truncate the sibling's issue — an invalid object parsed `ok: true`. `.catch` now runs against a private child ctx.
- `parseReactiveAsync` supersedes stale in-flight results (the file header claimed this but the implementation didn't do it): an awaited stale frame resolves to the LATEST run's verdict — typing fast can never apply a stale validation.
- `s.discriminatedUnion` registers `s.enum(...)` / `s.nativeEnum(...)` discriminant values (previously only literals — enum-tagged members were unreachable) and dev-throws at construction on a non-registrable discriminant field or a duplicate tag value.
- Union members now run against the shared parse ctx: a winning member's `pending` serverCheck entries propagate (previously silently dropped), and per-member result-envelope allocation is gone.
- `schema['~standard']` is memoized — repeated reads return the same object (was a fresh object + closure per access).

**New:**

- `toJsonSchema(schema, { unrepresentable? })` — JSON Schema draft 2020-12 emission from the new `@pyreon/validate/json-schema` subpath (input-shape contract; unrepresentable kinds throw or emit `{}`; cyclic `s.lazy` throws — no `$defs` in v1).
- `@pyreon/validate` now serves MCP `get_api` (api-reference region migrated).

**Performance** (process-isolated bench, pooled CI95): scalar-email valid-parse is now 🤝 TIED with ArkType (was 1.4× behind) via a table-driven email scanner (~1.6× the Zod-parity regex, exhaustive+fuzz equivalence-locked); array rows now win 1.9–2.3× vs ArkType (were ~1.1–1.2×) via JIT static-path elision (`ctx.path` untouched on the valid path, full issue paths reconstructed only at failure sites); flat-object narrows to ~1.2× (ArkType aliases the input; Pyreon keeps immutable strip-clone semantics — documented Pareto). Error-path dominance kept on every row (33–44× Zod, 20–53× ArkType).

**Breaking (pre-1.0):** the never-implemented `ParseCtx.abortOnFirst` field is removed; JIT-compiled schemas now report field-level async-in-sync errors at the ROOT (interpreter parity) instead of a per-field message.
