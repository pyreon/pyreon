---
'@pyreon/compiler': patch
'@pyreon/solid-compat': patch
---

fix(compiler, solid-compat): close two real CodeQL alerts (polynomial-redos + prototype-pollution)

Closes the two CODE-level CodeQL alerts on the repo. The other four
open alerts (`Fuzzing`, `CII-Best-Practices`, `Maintained`,
`Code-Review`) are OpenSSF Scorecard metadata — repo-practice
recommendations, not code-fixable.

## Alert #65 — `js/polynomial-redos` (severity: high)

**`packages/core/compiler/src/pyreon-intercept.ts:996`** — the
`hasPyreonPatterns` fast-path regex for the `onClick={undefined}`
detector had an unbounded `\w*` quantifier:

```ts
/on[A-Z]\w*\s*=\s*\{\s*undefined\s*\}/.test(code)
```

Polynomial-time on inputs like `onAAAA…` (long runs of `[A-Z]`):
per starting position the greedy `\w*` consumes O(N) chars before
the trailing `=` fails to match, giving O(N²) overall on N starting
positions.

**Fix**: cap the `\w*` to `\w{0,60}`. Real `on*` handler identifiers
are at most ~25 chars (`onPointerLeaveCapture`); 60 leaves headroom.
The cap keeps the regex linear regardless of input shape.

This file already uses bounded quantifiers (`{1,500}` / `{0,500}`)
on its OTHER regex sites with the same rationale documented inline
(lines 997-1008) — this fix brings the `on*` pattern in line with
the established convention.

## Alert #22 — `js/prototype-polluting-assignment` (severity: medium)

**`packages/tools/solid-compat/src/index.ts:1040`** — `applyAtPath`
already guards against `__proto__` / `constructor` / `prototype`
keyed writes via a `DANGEROUS_KEYS.has(key)` Set lookup at line 1036,
BUT CodeQL's `js/prototype-polluting-assignment` taint-tracking
does NOT propagate dataflow through `Set.has` calls. The analyzer
needs explicit `===` checks against the literal key names to
recognise the guard.

**Fix**: inline the comparisons:

```ts
if (
  typeof key === 'string' &&
  (key === '__proto__' || key === 'constructor' || key === 'prototype')
) {
  return
}
```

Same set of dangerous keys; just a form CodeQL's taint-tracking can
follow. Behaviorally identical — both guards refuse the same three
keys before the bracket-notation assignment on line 1042.

## Validation

- `bun run --filter='@pyreon/compiler' typecheck` — clean
- `bun run --filter='@pyreon/solid-compat' typecheck` — clean
- `bun run --filter='@pyreon/compiler' test pyreon-intercept` — 70/70 pass
- `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
- `bun run gen-docs --check` — clean
- `bun run check-doc-claims` — clean
- `bun run check-manifest-depth` — clean

CodeQL re-scan on merge will close both alerts automatically.

## NOT in this PR

The other four open alerts (`Fuzzing` / `CII-Best-Practices` /
`Maintained` / `Code-Review`, all "no file associated") are OpenSSF
Scorecard metadata about repo practices — not code-fixable. They'd
need separate workflow / CI / policy changes if pursued.
