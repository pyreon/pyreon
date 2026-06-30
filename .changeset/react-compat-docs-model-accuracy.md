---
'@pyreon/react-compat': patch
---

docs: correct the README and docs-site page to the actual value +
re-render model. The docs previously described a superseded run-once /
getter model — `useState` documented as returning a getter (`count()`),
deps arrays "ignored", `useCallback` / `memo` "no-ops", "no hooks rules",
"no stale closures" — none of which matches the shipped code (`useState`
returns the value directly, the component re-runs on state change, hooks
are positional, and `useEffect` / `useMemo` / `useCallback` honor deps;
`memo` genuinely memoizes via shallow-equal). Following the old docs
produced code that throws (`count()` on a number). The docs now document
the real behavior plus the two genuine caveats: nested child state resets
when an ancestor re-renders, and class components are unsupported stubs
(`setState` / `forceUpdate` warn-and-no-op, lifecycle never fires). The
already-correct notes (concurrent-mode no-ops, class stubs) are kept. No
runtime change.
