# Static-resolution call-site audit

Follow-up to E2 (PR #338). The 44× per-mount win matters only if real apps have a high enough fraction of literal-prop call sites for the future compiler pass to collapse. This audit measures it.

## Method

`audit-call-sites.ts` walks every `*.tsx` under `examples/`, parses each via `oxc-parser`, and for any JSX whose tag name matches one of the 67 `@pyreon/ui-components` exports, classifies its `state` / `size` / `variant` / `theme` / `mode` props as:

- **literal** — `state="primary"`, `size="large"`, or no value (boolean attribute)
- **dynamic-expr** — `state={signal()}`, `size={cond ? 'a' : 'b'}`, etc.
- **spread** — `<Button {...props} />`

A call site is **statically resolvable** if it has zero dynamic dimension props and zero JSX spread. (Components with no dimension props at all are also resolvable — nothing for the compiler to fall through on.)

## Headline

| | Count | % |
|---|---:|---:|
| Total rocketstyle call sites in `examples/` | **576** | 100% |
| Statically resolvable | **549** | **95.3%** |
| Dynamic | 27 | 4.7% |

Reasons for falling through:

- `dynamic-dimension-prop`: 26 sites (4.5%) — most are `theme={signal()}` for dark/light mode swap
- `jsx-spread`: 1 site (0.2%)

## Per-component breakdown (top components, ≥5 sites)

| Component | Total | Resolvable | Resolvable % |
|---|---:|---:|---:|
| Title | 208 | 207 | 100% |
| Button | 86 | 73 | 85% |
| Paragraph | 62 | 62 | 100% |
| Kbd | 25 | 25 | 100% |
| Avatar | 17 | 17 | 100% |
| Chip | 17 | 17 | 100% |
| Input | 14 | 10 | 71% |
| Badge | 14 | 14 | 100% |
| Loader | 14 | 14 | 100% |
| Card | 12 | 9 | 75% |
| Box | 12 | 12 | 100% |
| Progress | 11 | 11 | 100% |
| Image | 10 | 10 | 100% |
| Alert | 7 | 7 | 100% |
| Highlight | 7 | 7 | 100% |
| Checkbox | 6 | 6 | 100% |
| NavLink | 6 | 1 | 17% |
| Divider | 6 | 6 | 100% |
| Notification | 5 | 5 | 100% |
| Code | 5 | 5 | 100% |
| Center | 5 | 5 | 100% |

The two outliers — **NavLink at 17%** and **Button at 85%** — are worth looking at:

- **NavLink** in `ui-showcase/src/demos/NavLinkDemo.tsx` uses `state={isActive ? 'active' : 'inactive'}` (ternary with literal endpoints). A future compiler enhancement could detect this shape and emit two collapsed branches + a switch. **In the v1 compiler pass, NavLink with reactive state stays on the slow path.** Cost: ~1% of total call sites.
- **Button** falls below 100% because of `theme={signal()}` (dark/light mode switching) — 13 sites in perf-dashboard's stress test. Same theme-swap pattern accounts for most of the 4.7% codebase-wide.

## Honest caveats

1. **Examples are biased toward canonical usage.** Real production apps may have more dynamic patterns (route-driven variants, A/B test branches, theme-swap). A reasonable pessimistic estimate: real apps drop to 70-80% resolvable.
2. **The `theme={signal()}` pattern is the dominant non-resolvable shape.** Apps that don't switch themes at runtime (rare) would hit ~99% resolvable. Apps that do (most production apps) sit in the 80-95% range.
3. **The audit doesn't classify the literal-ternary case** (`state={cond ? 'a' : 'b'}` with literal endpoints). Those count as dynamic in this scan but a compiler pass could opt into branch resolution. Treating them as resolvable would push the headline above 95%.

## Combined with E2's 44× per-mount win

| Resolvable % | Weighted speedup (44× × resolvable + 1× × dynamic) |
|---|---|
| 95% (this audit) | **41×** |
| 80% (pessimistic real-app estimate) | **35×** |
| 70% (very pessimistic) | **31×** |
| 50% (worst-credible case) | **22×** |

**Even the worst-credible case is a 22× weighted improvement.** The achievable bound on real apps is dramatic.

## Decision input

The compiler-pass RFC (option C) was scoped at "estimate ≥40% resolvable to justify the compiler work." Actual: **95.3% in examples, 70-80% reasonable real-app estimate.** Justification is overwhelming.

## Caveats for the RFC

When designing the compiler pass:

1. **Theme-prop reactivity is the dominant fall-through pattern.** The pass should make `theme={signal}` ergonomic to fall through — users shouldn't have to manually mark sites "do not collapse." The detector AST-walks dimension prop values and flags non-literal expressions.
2. **Ternary-with-literal-endpoints is worth a v2 enhancement.** Cost: small compiler complexity, recovers ~1-2% of call sites.
3. **JSX-spread is unsalvageable.** Only 1 site in 576. Fall through silently; no special handling.

## What lands

- `audit-call-sites.ts` — the AST walker (re-runnable as the codebase grows)
- `AUDIT.md` — this report

## Reproducing

```bash
cd /repo/root
bun examples/experiments/e2-static-rocketstyle/audit-call-sites.ts
```

Output is the table above. Run with stdout capture for archival; commit the produced numbers as part of any follow-up RFC PR.
