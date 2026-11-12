---
'@pyreon/compiler': minor
'@pyreon/cli': patch
---

`pyreon check` and doctor's react-patterns gate no longer skip files whose only React habit is `.map()` in JSX, `onChange` on an input, a compound `.value +=` on a signal, a bare `memo(...)`, or `useLayoutEffect`. `hasReactPatterns` is now derived from one trigger per detector code (`REACT_PATTERN_TRIGGERS`, typed over `ReactDiagnosticCode`), so it cannot drift from the detectors. `hasPyreonPatterns` now also passes Plain Mode modules, so `plain-mode` findings reach `pyreon check` and doctor.

Breaking (types): five `ReactDiagnosticCode` members that no detector ever emitted are removed — `use-layout-effect` (reported under `use-effect-*`), `dangerously-set-inner-html` (a supported Pyreon prop), `key-on-for-child`, `create-context-import` and `use-context-import` (reported under `react-import`).
