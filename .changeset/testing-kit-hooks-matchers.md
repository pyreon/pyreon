---
'@pyreon/testing': minor
---

`@pyreon/testing` gains `renderHook`, jest-dom-style DOM matchers, and two setup sub-entries. `renderHook(hook, { initialProps })` runs a Pyreon hook once in a probe component (Pyreon semantics — hooks run once) and exposes its return via `result.current`; `rerender(props)` updates the reactive props signal so `computed`/`effect` derivations re-run without re-invoking the hook. `@pyreon/testing/matchers` registers a lean, zero-dependency set of DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toBeVisible`, `toBeEmptyDOMElement`, `toContainElement`, `toHaveFocus`); `@pyreon/testing/vitest` is a `setupFiles` entry that also auto-registers `afterEach(cleanup)`.
