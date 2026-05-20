---
'@pyreon/compiler': patch
---

feat(compiler): handler-combined dynamic-collapse emit — `__rsCollapseDynH` for ternary-of-two-literals + `on*` handlers

Follow-up to PR A (`_rsCollapseDynH` runtime helper). Closes the bulk
of the 15.4% dynamic-prop bail bucket measured by the bail census
(the strict no-handler scope only addressed 0.2% of all real-corpus
sites; the bigger slice is handler-combined ternaries like
`<Button state={cond ? 'a' : 'b'} onClick={h}>` — the most common
real-world shape).

## What this PR ships

1. **`scanCollapsibleSites` extension** — drops the `dyn.handlers.length === 0`
   guard. Handler-bearing dynamic sites now expand into TWO `CollapsibleSite`
   entries (one per literal value) like no-handler ones. Handlers don't
   affect the resolver's input (componentName, props, childrenText) —
   they're re-attached by the runtime helper.

2. **`tryDynamicCollapse` extension** — stops bailing when handlers are
   present. Routes handler-bearing sites to `__rsCollapseDynH(html,
   classes, valueIndex, isDark, handlers)` (5-arg combined emit);
   no-handler sites stay on `__rsCollapseDyn` (4-arg, lighter).
   Handlers object literal built from sliced source spans (same shape
   as `tryPartialCollapse` re-emits handlers via `__rsCollapseH`).

3. **Conditional helper imports** — adds `_rsCollapseDynH` to the
   preamble when `needsCollapseDynH` is set (lighter modules pull
   only what they use).

## Bail-census update

The `dynamicTernaryAddressable` counter in `collapse-bail-census.test.ts`
drops the `!sawHandler` requirement — handler-combined ternaries are
now addressable too. The trustworthiness gate
(`myCollapsible + 2 * dynamicTernaryAddressable === scannerCollapsible`)
still holds because the scan emits 2 entries per dynamic site
regardless of handlers.

## Build-artifact gate

Extended the `ui-showcase × spa` verify-modes cell's dynamic-collapse
probe to render TWO Buttons:

- `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">Dyn</Button>` → `__rsCollapseDyn`
- `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium" onClick={h}>DynH</Button>` → `__rsCollapseDynH`

The `assertDynProbeCollapsed` helper gains a fifth fingerprint —
`handlerCombinedShape` — that matches `===\`dark\`,{` (the 5-arg
`__rsCollapseDynH` signature has the handlers object immediately
after the mode accessor; the 4-arg `__rsCollapseDyn` ends with `)`
at that point). Combined with the existing four fingerprints, this
proves BOTH emit paths fire in the same chunk.

## Bisect verification

| Bisect | Effect | Outcome |
|---|---|---|
| Disable handler routing in `tryDynamicCollapse` | All handler-combined sites silently fall through to `__rsCollapseDyn` | `handlerCombinedShape=false`; other 4 fingerprints stay true (the no-handler path keeps working) → cell FAILS with the right diagnostic |
| Restore | All 5 fingerprints true → cell PASSES |

Asymmetry proves the `handlerCombinedShape` fingerprint is the
unique signal of the combined-emit path firing.

Also re-verified at the compiler-test layer: 1285/1285 specs pass
(the obsolete "SKIPS expansion when handlers present" scan spec was
updated to assert the NEW behavior — expansion happens for
handler-combined sites too).

## Re-lands #771's content

PR #771 (`verify-modes` cell + bail-census ratchet) was merged into
its base branch (the pre-rebase `feat/collapse-dynamic-props-pr3`)
but its content was LOST when #767 was rebased + merged to main
(stacked-PR base-rebase trap). This PR re-applies #771's probe +
verify-modes cell + bail-census ratchet via cherry-pick AND extends
them for the handler-combined path.

## Drive-by: CLAUDE.md hygiene

The dynamic-prop section had "PR 1 of 4 SHIPPED" and "PRs 2-4 are
follow-ups" language reflecting the in-flight state. Now the whole
sequence (plus the handler-combined follow-up) has shipped — the
note is consolidated into a single "fully shipped" entry covering
both helpers (`_rsCollapseDyn` + `_rsCollapseDynH`), the compiler
path, and the three-layer bisect coverage.

## Validation

- `bun run --filter='@pyreon/compiler' typecheck` — clean
- `bun run --filter='@pyreon/compiler' lint` — zero errors
- `bun run --filter='@pyreon/compiler' test` — 1285/1285 pass
- `bun run --filter='@pyreon/vite-plugin' typecheck + test` — clean
- `bun run verify-modes ui-showcase` — 2/2 cells pass
- `bun run gen-docs --check` — clean
- `bun run check-doc-claims` — clean
- `bun run check-manifest-depth` — clean
- `bun run check-bundle-budgets` — clean (compiler size unchanged)

## Surfaces updated

- `packages/core/compiler/src/jsx.ts` — `scanCollapsibleSites` drops
  handler-skip guard; `tryDynamicCollapse` routes handler-bearing
  sites to `__rsCollapseDynH`; `needsCollapseDynH` flag + conditional
  import
- `packages/core/compiler/src/tests/dynamic-collapse-scan.test.ts` —
  obsolete "SKIPS when handlers" spec updated to assert NEW behavior
- `packages/core/compiler/src/tests/collapse-bail-census.test.ts` —
  `dynamicTernaryAddressable` counter drops the `!sawHandler`
  restriction; report log + docstring updated
- `examples/ui-showcase/src/routes/rs-collapse-dyn-probe.tsx` —
  dual-Button probe (`Dyn` + `DynH`); re-lands #771's content + extends
- `scripts/verify-modes.ts` — `assertDynProbeCollapsed` gains a 5th
  fingerprint (`handlerCombinedShape`); re-lands #771's content + extends
- `CLAUDE.md` — consolidated dynamic-prop section, drops "PR X of 4"
  qualifiers, documents both helpers

## Related

- **#773** (open) — PR A: `_rsCollapseDynH` runtime helper (this PR depends on it)
- **#765 / #766 / #767** (merged) — dynamic-prop sequence PRs 1-3
- **#771** (merged into pre-rebase pr3 branch, content lost on main; re-landed here)
- **#761** (closed spike) — originally surfaced the recommendation
