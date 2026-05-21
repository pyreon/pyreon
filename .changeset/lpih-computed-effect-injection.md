---
'@pyreon/reactivity': minor
'@pyreon/vite-plugin': minor
---

LPIH: build-time `__sourceLocation` injection now covers `computed()` and `effect()` calls (R8 — extension of R4). Previously only `signal()` got the build-time literal; `computed()` and `effect()` still paid the runtime `new Error().stack` capture cost (~2.2 µs per creation when devtools is active).

Three forms covered by the extended `injectSignalNames`:

- `const x = signal(...)` → `signal(..., { name: "x", __sourceLocation: {...} })`
- `const d = computed(() => ...)` → `computed(..., { name: "d", __sourceLocation: {...} })`
- `effect(() => ...)` (unbound) → `effect(..., { __sourceLocation: {...} })` (no `name` — anonymous effects have no binding to derive from)

Unbound `signal()` / `computed()` are left untouched (rare anonymous patterns). The unbound-effect pass uses negative lookbehind `(?<![\w$.])` to skip member-access (`obj.effect()`) and identifier-suffix (`sideEffect()`) false-positives.

`@pyreon/reactivity` exposes the matching surface on the runtime side:
- `ComputedOptions<T>` gains an `@internal __sourceLocation` field; `computed()` threads it through to both internal paths (`computedLazy` / `computedWithEquals`), preferring it over `_captureCallerLocation(2)` in `_rdRegister`
- new `EffectOptions` interface with the same `@internal __sourceLocation` field; `effect(fn, options?)` accepts the second arg

Bisect-verified: narrowing the bound regex to `signal`-only AND disabling the unbound-effect pass fails 6 of the 11 new R8 tests with the expected error shapes (e.g. `expected to have a length of 4 but got 1` on the multi-primitive injection count); restored → 26/26 (15 R4 + 11 R8) pass. No `TEMP BISECT` remnants in source.

Full suites green: `@pyreon/reactivity` 377/377, `@pyreon/vite-plugin` 130/130.

Closes R8 from the LPIH foundation PR (#769) followups queue.
