---
'@pyreon/lint': patch
---

Two gaps found by probing the rules that every shipped preset turns OFF.

`rule-fires.test.ts` asserts totality — every rule has a fires fixture and a quiet counterpart — and 39 rules were still unverified against reality, because opt-in, monorepo-scoped and dependency-gated rules never run under `recommended`. Force-enabling all 39 over 5,386 real files, then building a positive control for each of the 12 that stayed silent, found two:

- **`prefer-canonical-primitive` read JSX only.** Pyreon has two spellings for a DOM element, and `@pyreon/primitives`' own web implementations are written entirely in `h('div', …)` — so the rule reported nothing on files made of nothing but DOM elements. It now covers the `h()` form, gated on `h` being imported from `@pyreon/core`/`@pyreon/runtime-dom` so somebody else's `h` is never flagged, and on a string first argument so `h(Component)` stays a component.
- **`no-circular-import` enforced `packages/core/` only.** The layer order it owns also exists in `packages/ui-system/` — the tree where a real `ui-core` ↔ `unistyle` cycle happened and was fixed by the theme-engine registration seam, guarded since by nothing but that fix's own tests. The two orders are INDEPENDENT stacks, compared only within a file's own tree, so a ui-system package importing a core one stays correct.

`connector-document` and `document-primitives` are deliberately unranked: they are not in the documented chain, and ranking them by eye produced 41 findings in a tree with no real violation. An unranked package is ignored — a guessed rank is worse than no rank.

The other ten silent rules are healthy; the repo simply contains none of their defects. Verifying that took care: a dependency-gated rule probed at a synthetic path measures the gate rather than the rule, and `no-circular-import` is a layer-order rule despite its name, so the obvious probe reported a working rule as dead.
