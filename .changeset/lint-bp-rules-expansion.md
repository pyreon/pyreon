---
'@pyreon/lint': minor
---

feat(lint): 4 opt-in best-practice rules — frontend a11y + dep-gated @pyreon/storage

Adds 4 opt-in rules (80 rules / 18 categories, up from 76 / 17) on the
existing `meta.optIn` + dependency-auto-detection foundation. `pyreon
doctor` surfaces them automatically (its lint gate is category-agnostic,
keyed on `meta.optIn`); the `recommended`/`strict`/`app`/`lib` presets
force them OFF, the `best-practices` preset enables them at declared
severity. Backward-compatible (opt-in default = no behavior change).

**Frontend a11y (category `frontend`, all `optIn`):**

- `pyreon/no-autofocus` (warn, **fixable**) — the `autoFocus`/`autofocus`
  attribute moves focus on mount, disorienting screen-reader/keyboard
  users. Skips `autoFocus={false}`. Fix removes the attribute.
- `pyreon/no-redundant-role` (warn, **fixable**) — a `role` that
  duplicates the element's implicit ARIA role. Conservative tag→role map
  (zero-FP: `a`→`link` only with a static `href`; dynamic values and
  component elements skipped). Fix removes the attribute.
- `pyreon/anchor-is-valid` (warn) — `<a>` with no `href`, or `href` of
  `""` / `#` / `javascript:`. Not fixable (button-vs-link intent is
  ambiguous); `href={dynamic}` skipped.

**Library best-practice (new category `storage`, `optIn` + dep-gated):**

- `pyreon/no-storage-write-as-call` (error, **fixable**) — gated on a
  declared `@pyreon/storage` dependency. `useStorage` /
  `useSessionStorage` / `useCookie` / `useIndexedDB` / `useMemoryStorage`
  return a `StorageSignal`; `s(next)` reads-and-discards the argument
  like any signal call. Same proven conservative shape as the
  `signal-write-as-call` detector (tracks the `const s = useStorage(...)`
  binding, fires only on a bare-identifier call with ≥1 arg, skips
  `.set`/`.update`/`.remove` and zero-arg reads). Fix: `s(x)` → `s.set(x)`.

Deferred with rationale (NOT silently dropped): `control-needs-label`
and broad machine/hotkeys/permissions/state-tree rules — label/aria
association and those surfaces need cross-element id / scope / type
resolution an AST walker can't do without false positives (the explicit
"high-risk cliff" the codebase avoids for detectors).

Each rule ships paired FIRES / DOES-NOT-FIRE specs (the dep-gated one
also a "dep absent → silent" spec); bisect-verified (disabling
`context.report` in `no-storage-write-as-call` fails its 3 fire/fix
specs, restored → 9/9). New public surface: `RuleCategory` gains
`'storage'`. Meta-tests updated (rule count 76→80, category counts,
`best-practices-preset` opt-in set 9→13). `@pyreon/lint` 634 tests
pass; manifest regenerated `llms-full.txt` + MCP `api-reference.ts`
(`gen-docs --check` clean); oxlint + typecheck clean.
