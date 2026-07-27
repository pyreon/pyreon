---
'@pyreon/runtime-server': patch
---

Stop reading `process.env.NODE_ENV` once per element during SSR.

`warnIfUnsafeTag` runs for every element rendered and gated itself with an
inline `process.env.NODE_ENV === 'production'` check. In Node that is not a
constant — it is a getter over the real environ, measured at 767ns per read vs
25.6ns for a resolved value. A CPU profile of a 1,000-row `h()` render showed
that single check at **36.7% of SSR self-time**.

The gate is now resolved ONCE at module init by selecting a no-op implementation
in production. Measured on Node, paired before/after per round:

    4.723ms -> 2.868ms   (1.65x)
    2.568ms -> 0.933ms   (2.75x)
    1.414ms -> 0.756ms   (1.87x)

Bundled consumers are unaffected: the ternary condition is still the bare inline
expression, so a bundler define folds it to `true`, the ternary collapses to the
no-op, and the warning string becomes unreachable and tree-shakes.
