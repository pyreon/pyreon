---
'@pyreon/compiler': patch
---

feat(compiler): `query-options-as-function` detector — makes the @pyreon/query best-practice proactive in MCP `validate`

`#632` shipped `pyreon/query-options-as-function` as an opt-in `@pyreon/lint`
rule — **reactive**: an AI agent only sees it after running
`pyreon doctor` / `pyreon-lint`. This adds the same check as a
`detectPyreonPatterns` code in `@pyreon/compiler`, so the MCP `validate`
tool flags it **proactively** — an agent calling `validate({ code })`
while writing sees the fix (`useQuery(() => (...))`) before the code is
ever committed. Closes the genuine functional gap (proactive AI-fix),
not just more coverage.

- New `PyreonDiagnosticCode: 'query-options-as-function'`. Fires on an
  object-literal first arg to `useQuery` / `useInfiniteQuery` /
  `useQueries` / `useSuspenseQuery`. `useMutation` excluded by design
  (imperative — plain object is correct); identifier/call args stay
  silent (statically unprovable). `fixable: false` (the documented
  invariant — no `migrate_pyreon` tool yet).
- Wired into the AST dispatch + the `hasPyreonPatterns` regex pre-filter.
- Shares one `[detector: query-options-as-function]` tag in
  `.claude/rules/anti-patterns.md` with the lint rule (the
  `detector-tag-consistency` drift guard enforces the loop; #632's
  entry used the wrong tag form — corrected here).

Bisect-verified (neuter → 2 FIRES specs fail, restore → 73/73 pass).
`@pyreon/compiler` suite + the MCP `validate` zero-false-positive guard
green. Docs: CLAUDE.md detector list 14 → 15.
