---
'@pyreon/testing': minor
---

`@pyreon/testing` gains the reactive-native matchers — the differentiator DOM-only testing libraries can't express. `expectSignal(sig).toHaveChangedTimes(n)` / `expectSignal(computed).toHaveRecomputedTimes(n)` assert fire counts; `expectEffect(handle).toReRunWhen(action)` and `.notToReRunWhen(action)` assert fine-grained re-run behavior — the NEGATIVE form ("this unrelated write did NOT re-run the effect") is impossible under a whole-component re-render model. They read Pyreon's reactive graph and require a dev/test build (a production build tree-shakes the graph — the matchers throw a clear error rather than silently pass). Replaces the hand-rolled `let ran = 0; …; expect(ran).toBe(n)` pattern.
