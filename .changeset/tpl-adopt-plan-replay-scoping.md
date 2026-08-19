---
'@pyreon/runtime-dom': patch
---

Scope the compiled-template adoption PLAN fast path to `<For>` rows, so it can
no longer skip the static-skeleton gate.

`tplAdoptVerify` caches an `AdoptPlan` per template and can spot-replay it
instead of re-walking the skeleton. That is sound for `<For>` rows — one
`renderItem`, so rows 2..N are structurally identical to row 1 by construction
— but it ran for every adoption. The plan is keyed by the TEMPLATE element and
`_tplCache` is keyed by the HTML string and is process-global, so two unrelated
components that compile to the same template shared one plan. For a static
template `replayAdoptPlan` has no triplet or removal spots to check and returns
true unconditionally, so the second component adopted ANY same-tag target
without any structural verification — precisely the mis-consumption the
skeleton gate exists to make harmless.

Reproduced at default settings, no compiler option involved: a local
`<div class="other">X</div>` reached the armed slot first and came back
carrying the server root's `class="root"` and its text. The rendered page still
looked correct (the real root cloned afterwards), so the damage was confined to
the detached node the app holds a reference to — silent by construction.

Plan replay is now opt-in via `_setTplAdoptTarget(el, allowPlanReplay)` and only
the `<For>` row loop opts in; component-root adoption always runs the full
verify. The `<For>` fast path is unchanged and is now observable through a new
dev counter, `runtime.tpl.adoptPlanReplay`, so losing it becomes a failing
assertion rather than a silent regression.
