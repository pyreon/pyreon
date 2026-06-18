---
'@pyreon/compiler': patch
---

The Rust native backend now implements the FULL rocketstyle-collapse emission
(`__rsCollapse`) — byte-for-byte identical to the JS backend. This is the
foundation of pairing the collapse feature (previously JS-path-only) to Rust.

Adds the resolved-collapse config across the napi boundary (a new optional 6th
`transform_jsx` arg — `CollapseConfig` { candidates, sites, mode, … }; existing
5-arg calls are unaffected), the FNV-1a collapse-key (UTF-16 code-unit hash,
matching JS `charCodeAt`), the full-shape detector (string-literal props +
text-only children), the `__rsCollapse` emit (with brace-wrap when the parent
is JSX), and the imports + idempotent `injectRules` prologue.

The JS `transformJSX` dispatcher still force-routes collapse to the JS backend
(a file goes wholesale to one backend, so the route can only flip once ALL
variants are ported); the remaining variants (partial `__rsCollapseH`, dynamic
`__rsCollapseDyn`/`DynH`, element-child) + the force-route removal + the
vite-plugin native wiring are follow-on PRs.

Verified: a Rust FNV-key unit test against the JS oracle, + 8 cross-backend
equivalence fixtures (top-level / fragment-child brace-wrap / multi-prop /
unresolved / non-candidate / dynamic-prop bail / ruleKey dedup / JSON-escape),
all JS≡Rust. Full compiler suite 1523/1523. Bisect-verified (disabling the
collapse hook diverges 5 fixtures; restored → green).
