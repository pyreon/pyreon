---
'@pyreon/preact-compat': patch
---

docs: correct the README to the actual value + re-render model. The docs
previously described a superseded run-once / getter model — `useState`
documented as returning a getter (`count()`), deps arrays "ignored",
`useCallback` a "no-op", class lifecycle "not called" — none of which
matches the shipped code (`useState` returns the value directly, the
component re-runs on state change, `useEffect`/`useMemo`/`useCallback`
honor deps, and four class lifecycle methods fire). Following the old
docs produced code that throws (`count()` on a number). The README now
documents the real behavior plus the two genuine caveats: nested child
state resets when an ancestor re-renders, and class-based error
boundaries (`componentDidCatch`/`getDerivedStateFromError`) are not
implemented. No runtime change.
