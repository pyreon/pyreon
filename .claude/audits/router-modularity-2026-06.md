# Router feature-modularity — measured NO-GO (2026-06)

**Question (recurring):** `@pyreon/router` ships its full feature graph — SWR,
loaders, guards, prefetch, view-transitions, typed-search — even for a static
site that uses none of them. Can we make those features tree-shakeable so a
simple site ships a smaller router? Repeatedly flagged as "worth it eventually
for the bundle story."

**Verdict: NO-GO.** Measured sheddable surface is **~0.8 KB gz (three biggest
features, body-level) → ~2–2.8 KB gz thorough** — below the ~4 KB go/no-go gate,
on the framework's most correctness-critical package, for ~2–3 % of a real
86 KB app bundle (bokisch.com). Joins `autosplit` and `resumability` in the
measured-and-shelved set. Do **not** re-propose without a real app proving the
router floor is the bottleneck.

## Structure (verified)
- `createRouter` is a **closure factory**, not a class. Every optional feature
  lives as **branches/helpers inside that one closure** in `router.ts` (guards,
  loader cache/dedup/SWR, the view-transition commit wrapper, typed-search),
  plus `scroll.ts` (`ScrollManager`, a separate module) and `loader.ts`
  (`prefetchLoaderData`).
- `match.ts` is the clean, irreducible **core** — standalone pure functions
  (`resolveRoute`/`matchPath`/`buildPath`/`buildNameIndex`). Not sheddable.
- `sideEffects: false` is already set → tree-shaking is enabled; the bulk that
  ships is genuinely *reachable* code, not a shaking defeat.
- The router's 10.5 KB gz is **dominated by that core** (matcher + navigation
  state machine + query parsing + RouterView/RouterLink + redirect). The
  features are a small fraction.

## The approach that was validated (reusable mechanism)
Not a god-file split (the high-risk extraction I'd originally floated — it would
thread the navigation state machine's internal state across new module
boundaries). The lower-risk approach is **build-time feature elimination**: gate
each optional feature behind a `define`-replaceable token the vite-plugin sets
(`'true'` default → folds away, perf-neutral; `'false'` → branch DCE'd), exactly
the mechanism that already strips reactive-devtools to zero in production.

**Validated empirically** (esbuild, prod define, minify+gzip):
- The gate MUST be written **inline at the `if` site**, never via a
  `const useVT = …; if (useVT)` alias — the alias is NOT reliably DCE'd
  (confirmed: it left `startViewTransition` + the whole VT block in the bundle;
  saved only 67 B). The inline form `if ((typeof __TOKEN__ === 'undefined' ||
  __TOKEN__) && …)` cleanly DCE'd the branch (`startViewTransition` /
  `updateCallbackDone` ABSENT). This is the same hard-won rule as the bare
  `process.env.NODE_ENV` gate (CLAUDE.md "Local `__DEV__` const alias prevents
  bundler tree-shake").
- Perf-neutral when ON: token defined `true` folds `true && …` away → byte-
  identical to today.

## Measured deltas (esbuild prod minify+gz, `@pyreon/*` externalized; baseline 10.5 KB gz)
| feature stripped | gz saved |
| --- | --- |
| view-transitions | 79 B |
| loaders (function bodies only) | 398 B |
| scroll (whole `ScrollManager` module drops) | 347 B |
| **all three off** | **827 B** |

Thorough ceiling (full loader subsystem incl. `prefetchLoaderData` + cache
helpers + `invalidateLoader`, + guards + typed-search) extrapolates to
**~2–2.8 KB gz** — still below the gate.

## Why NO-GO
~2 KB gz on the most correctness-critical package would require: per-feature
gates threading the navigation lifecycle, vite-plugin define-injection, a `zero`
config surface, a conservative usage auto-scan (with the false-positive risk of
wrongly stripping a *used* feature → a silently broken router), a bisect-verified
test per feature, and permanent maintenance. The ROI is wrong.

## Where the energy should go instead
**Collapse.** `pyreon({ collapse: true })` — Pyreon's unique compile-time
rocketstyle-collapse — is **off by default and used nowhere**, including
bokisch.com (verified: `_rsCollapse: 0`, bare `pyreon()`). Its win is *runtime*
(44× component mount, `styler.resolve` 22→0), the kind of advantage no other
framework can offer, and it reaches zero users today. Making collapse actually
adopted (dogfood + measure coverage → assess default-on) is far higher leverage
than shaving ~2 KB off the router. The validated build-flag-DCE mechanism above
is recorded for if/when a *higher-value* tree-shaking target appears (the router
isn't it).
