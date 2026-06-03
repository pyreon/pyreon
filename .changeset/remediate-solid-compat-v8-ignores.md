---
"@pyreon/solid-compat": patch
---

test(solid-compat): remediate cosmetic v8-ignore campaign with real tests

Removes the 19 `/* v8 ignore */` annotations introduced in PR #1300 and replaces them with 35 real tests covering the previously-uncovered branches via the public API.

Honest coverage trajectory:
- Pre-PR-1300 baseline: 88.21% branches
- PR #1300 (cosmetic): 95.33% via v8-ignores (gaming the gate)
- Now: 89.56% via real tests (+1.35pp over pre-cosmetic baseline)

Tests cover createEffect undefined-return, mergeProps/splitProps descriptor preservation (getters + symbols + null-descriptor false arms), useContext native Pyreon-context branch, createStore single-function setStore form, createResource stale-discard, filter-predicate setStore array updates, DANGEROUS_KEYS prototype-pollution protection, proxy ownKeys / getOwnPropertyDescriptor / delete traps.

Threshold lowered from 95 → 89 with documented rationale. Reaching 95% honestly would require refactoring out the structurally-unreachable defensive guards (proxy trap combinatorial arms, applyAtPath empty-path × non-fn-value, signal-eviction sweep) — a separate cleanup PR.
