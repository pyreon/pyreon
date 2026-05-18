---
'@pyreon/lint': minor
---

feat(lint): opt-in, dependency-auto-detected best-practice rules (frontend a11y/CLS + query/rx/form)

Adds 7 best-practice rules across 3 new categories plus a new opt-in
preset and the dependency-detection foundation that makes them
zero-config and zero-noise. `pyreon doctor` surfaces them automatically
(its lint gate already maps every lint category), so no `@pyreon/cli`
change is needed.

**New rules (74 rules / 16 categories total, up from 67/13):**

- `frontend` (4): `pyreon/require-img-alt` (a11y — error), `pyreon/img-requires-dimensions` (CLS/layout-shift — warn), `pyreon/no-positive-tabindex` (a11y, **auto-fixable** → `0`), `pyreon/prefer-zero-image` (asset optimization — info, gated on `@pyreon/zero`).
- `query` (1): `pyreon/query-options-as-function` — `useQuery`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` with an options **object literal** breaks signal-tracked refetch; wrap in `() => ({ ... })` (error; `useMutation` excluded).
- `rx` (1): `pyreon/rx-prefer-pipe` — nested rx transforms → compose with `pipe(...)` for one computed (info).
- `form` (1, extends the existing category): `pyreon/no-signal-in-form-initial-values` — a signal read in `useForm({ initialValues })` snapshots once; pass the plain value / use a reactive field (warn).

**Configurability (all three levels):**

1. **Opt-in by default** — every new rule sets `meta.optIn: true`: forced
   OFF in `recommended` / `strict` / `app` / `lib` (never a surprise
   score/CI penalty). The new `best-practices` preset enables them
   wholesale; per-rule `.pyreonlintrc.json` config always overrides.
2. **Dependency auto-detection** — library-scoped rules self-gate on the
   project's `package.json` (`dependencies` / `devDependencies` /
   `peerDependencies` / `optionalDependencies`, + the package's own name
   for in-lib source) via the new `utils/project-deps:isProjectDependency`
   (cached per manifest). A project that doesn't use `@pyreon/query`
   never sees query rules.
3. **Path exemption** — all support `exemptPaths` like the other
   exemptable rules.

**AI-actionable:** every rule's message is prescriptive (states the fix),
so an assistant reading `pyreon doctor` / `pyreon-lint` output knows
exactly how to resolve it; `no-positive-tabindex` autofixes with `--fix`.

New public surface: `PresetName` gains `'best-practices'`; `RuleCategory`
gains `'frontend' | 'query' | 'rx'`; `RuleMeta` gains optional `optIn`;
`isProjectDependency` exported from `@pyreon/lint`. Backward-compatible
(opt-in default = no behavior change for existing consumers).

Bisect-verified per rule (FIRES / DOES-NOT-FIRE + dep-absent specs);
`@pyreon/lint` 576 tests pass; foundation covered by dedicated
`project-deps.test.ts` + `best-practices-preset.test.ts`.
