---
'@pyreon/compiler': patch
---

Two new static detectors for the "accessor used as a VALUE" bug class, plus a hook tier for `static-early-return-conditional`:

- `accessor-uncalled-in-template` — a tracked accessor binding interpolated UNCALLED into a template literal (`` `${itemWidth}%` `` where `itemWidth = computed(...)`) stringifies the function SOURCE into the output — a CSS value / DOM text silently renders `() => …` (upstream-reported shipped bug; the compiler's signal auto-call pass covers JSX expression regions, not template interpolations). Fix named in the message: call it (`${itemWidth()}`). Tagged templates are excluded (a `css`/`styled` tag legitimately receives function interpolations).
- `accessor-uncalled-in-condition` — a tracked accessor binding used BARE (or under `!`) as the whole test or a top-level `&&`/`||` operand of an `if`/ternary outside JSX. An accessor is a function — always truthy — so `if (!has)` is dead and `if (has)` always-taken. `typeof x === 'function'`, `x == null`, property access, and guard shapes where the name is called in the same statement never fire.
- `static-early-return-conditional` now also fires on a zero-arg call of a hook-result const (`const loading = useLoading(); if (loading()) return <Skeleton/>`), exactly parallel to the signal tier.

All three share one binding collector. Zero-false-positive gating: hook-tier bindings (`const x = useX(...)`) fire only with in-file proof the binding is callable (a plain zero-arg `x()` call — `useId()`-style plain values and nullable `useRouter()`-style handles stay silent), and any name also bound by a non-accessor declaration/param/import anywhere in the file is ambiguous under the scope-blind collector and never fires (both shapes found by real-corpus validation over 4,451 files — 0 findings after gating). A new `diagnoseError` catalog entry teaches the rendered-function-source symptom.
