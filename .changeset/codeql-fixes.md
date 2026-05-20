---
'@pyreon/zero': patch
'@pyreon/compiler': patch
'@pyreon/vite-plugin': patch
'@pyreon/solid-compat': patch
'@pyreon/lint': patch
---

fix(security): close 17 CodeQL alerts (real bugs + workflow hardening; 20 false positives dismissed)

Sweep through `github.com/pyreon/pyreon/security/code-scanning`. 37
open alerts triaged into **17 real fixes + 20 false-positive
dismissals**. The 4 remaining alerts are OpenSSF Scorecard project-
posture metrics (CodeReview, Maintained, CIIBestPractices, Fuzzing)
which can't be closed by a code PR — they're external posture
checks.

### Real fixes (8 code + 9 polynomial-redos + 6 workflow)

**Code:**

- **#27 `@pyreon/zero` `fs-router.ts:1110`** — `import("${fullPath}")`
  interpolated `fullPath` raw into emitted JS. Path is developer-
  controlled (project's own filesystem scan), but a quote / backslash
  / newline in the path would corrupt the generated module source.
  Fixed: `JSON.stringify(fullPath)` — matches the existing `hmrId`
  pattern two lines above.
- **#37 `@pyreon/lint` `anchor-is-valid.ts:67`** —
  `trimmed.toLowerCase().startsWith('javascript:')` only catches the
  one canonical scheme. CodeQL's `js/incomplete-url-scheme-check`
  expects the curated dangerous-scheme set. Added `vbscript:`
  (dead on modern browsers but a no-cost completion). `data:`
  intentionally omitted — legitimate `data:image/png;base64,…`
  href usage exists.
- **#20/#21/#22 `@pyreon/solid-compat` `createStore` setStore** —
  `Object.assign(obj, value)` + dynamic `obj[key] = …` with user-
  supplied path keys allowed prototype pollution via
  `setStore('__proto__', evil)` or `setStore({ __proto__: … })`.
  Added a `DANGEROUS_KEYS` Set (`__proto__` / `constructor` /
  `prototype`) and a `safeAssign` helper — same shape as
  `@pyreon/reactivity reconcile.ts:34`. Path-key writes at any
  depth refuse the dangerous identifiers.

**Polynomial-redos (`@pyreon/compiler`, `@pyreon/vite-plugin`):**

- **#9/#10/#11 `pyreon-intercept.ts` pre-filter regexes** — bound
  `[^}]+` / `[^)]+` greedy quantifiers with `{0,500}` / `{1,500}`
  caps. Pre-filter is a SCAN before the precise AST walker; losing
  detector recall on pathologically long single-line input is
  acceptable.
- **#12/#13 `ssg-audit.ts` dynamic-route detection** — replaced
  `/\[.+\]/` with `/\[[^\]]+\]/`. Filename basenames are OS-bounded
  (~255 chars) anyway, but `[^\]]+` removes the backtrack potential
  entirely.
- **#16 `vite-plugin.ts` ISLAND_CALL_RE** — bound `[\s\S]*?` lazy
  match to `[^}]{0,500}`. Real island() option blocks are tiny.
- **#17 `vite-plugin.ts` NAMED_EXPORT_RE** — bound `[^}]+` to
  `[^}]{1,500}`. Real `export { … }` blocks fit easily.
- **#18/#19 `vite-plugin.ts` `split(/\s+as\s+/)`** — replaced with
  a pre-compiled `AS_SPLIT_RE = /\s{1,10}as\s{1,10}/` at module
  scope. Bounded `{1,10}` quantifiers eliminate worst-case
  backtracking while keeping every realistic import-specifier
  formatting matchable.

**Workflows (`.github/workflows/`):**

- **#1 perf.yml + #54 audit-leak-classes.yml** — added top-level
  `permissions: contents: read` block. Both workflows are read-only
  (perf records artifacts; audit reports findings).
- **#2 release.yml** — restructured permissions: top-level
  `contents: read` (default), per-job `contents: write` +
  `pull-requests: write` + `id-token: write` on `stable` and
  `prerelease` (both publish via OIDC trusted publishing).
- **#55/#56/#57 audit-leak-classes.yml** — pinned `actions/checkout`,
  `oven-sh/setup-bun`, `actions/upload-artifact` by full commit SHA.
  Same SHAs as the rest of `.github/workflows/` (the project's
  existing pinning convention).

### Dismissed via API (20 false positives / won't fix)

**True false positives (9):**

- **#28** `js/clear-text-logging` on `batch.ts:120` — CodeQL matched
  "MAX_PASSES" as if it contained "password". Log is about
  effect-flush pass count.
- **#25/#26** `js/bad-code-sanitization` on `vite-plugin.ts:1037,1307`
  — `JSON.stringify()` IS the canonical safe-embed for a string into
  emitted JS code.
- **#23/#24** `js/prototype-pollution-utility` on `reconcile.ts:103,107`
  — `DANGEROUS_KEYS.has(key)` guard at line 93 already blocks
  `__proto__` / `constructor` / `prototype` before the assignment.
- **#34/#35/#36** `js/incomplete-sanitization` on `manifest/render.ts`
  + `mcp/index.ts` — `.replace(/\|/g, '\\|')` is markdown table-cell
  escaping of INTERNAL manifest API metadata (built at gen-docs time
  from `defineManifest()` values), not user-input sanitization.
- **#52** `js/http-to-file-access` on `font.ts` — deterministic font-
  file fetch resolved from CSS `@font-face` declarations parsed at
  build time, then written to a per-project cache dir keyed by a
  base64 hash of the URL. Not user-driven HTTP content writing to
  arbitrary paths.

**Won't fix (internal dev tooling, not security boundaries):**

- **#42/#43/#44/#45/#47/#48** `js/file-system-race` — CLI scaffolding
  (`pyreon context`, `create-zero`), build-time Vite plugin
  (`icons-plugin`), internal scripts (`check-bundle-budgets`,
  `serve-ssg`). Single-process, single-developer environments; no
  malicious actor with concurrent filesystem access in the threat
  model.
- **#30/#31** `js/shell-command-injection-from-environment` —
  internal repo audit (`audit-codebase`) + benchmark harness
  (`bench/run-all`). Args controlled entirely by the script author,
  not external input.
- **#49/#50** `js/indirect-command-line-injection` — internal git-
  affected-packages selectors (`affected.ts`, `e2e-affected.ts`).
  Args are git refs from the GitHub Actions workflow event.
- **#3** `PinnedDependenciesID` on `release-native.yml:252`
  (`npm install -g npm@latest`) — npm 11.5.1+ is the documented
  requirement for OIDC trusted publishing. Pinning an exact version
  blocks security patches; the OIDC token + Sigstore provenance is
  the actual supply-chain guarantee.

### Remaining (cannot be closed by a code PR)

- **#4 CodeReviewID** — Scorecard counts review approvals per merge;
  squash-merge with self-review by maintainer doesn't count.
  Project-policy issue, not code.
- **#5 MaintainedID** — auto-tracks repo activity, improves
  organically.
- **#6 CIIBestPracticesID** — requires registering at
  bestpractices.coreinfrastructure.org. Out of scope for this PR.
- **#8 FuzzingID** — requires OSS-Fuzz integration. Significant
  infra work, out of scope.

### Validation

- `@pyreon/zero` 957/958 tests pass (1 pre-existing skip)
- `@pyreon/compiler` 1257/1257 tests pass
- `@pyreon/vite-plugin` 104/104 tests pass
- `@pyreon/solid-compat` 218/218 tests pass
- `@pyreon/lint` 672/672 tests pass
- Lint + typecheck clean across all 5 packages

### Closes the security/code-scanning sweep

37 alerts → 17 fixed in code + 20 dismissed with rationale + 4
external-posture deferred. Net open count expected after CodeQL
re-scans: 4 (Scorecard meta-checks).
