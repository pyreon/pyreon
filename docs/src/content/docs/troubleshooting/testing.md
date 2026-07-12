---
title: "Testing Mistakes"
description: "Common testing mistakes in Pyreon and how to fix them."
---

# Testing Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### happy-dom fires `hashchange` for `history.pushState`/`replaceState` — deferred, so the echo can land in the NEXT test

real browsers never fire `hashchange` for pushState/replaceState (WHATWG: only fragment navigations); happy-dom's `Location[setURL]` queues one on a `setTimeout` whenever the hash differs. Any code that treats `hashchange` as a genuine traversal (e.g. `@pyreon/router`'s browser-nav pipeline) then sees a STALE echo of a previous test's URL write — delivered mid-way through the next test, superseding its in-flight navigation with a path from the previous test. Passes in isolation, fails in the full file run; real Chromium never reproduces it. **Fix (spec-parity patch, not router code)**: wrap `history.pushState`/`replaceState` in the package's vitest `setupFiles` to count hash-changing calls and swallow that many synthetic `hashchange` events in a capture-phase listener; discriminate tests' MANUAL `new HashChangeEvent('hashchange')` dispatches by their empty `oldURL` (happy-dom populates it, manual events leave `''`). `location.hash = …` assignments are real fragment navigations and must NOT be swallowed. Reference: `packages/core/router/src/tests/setup.ts` (wired via `setupFiles` in vitest.config.ts).

---

### Running `bun test`

Use `bun run test` (runs vitest via package scripts)

---

### Missing cleanup

Always clean up mounted components, dispose effects

---

### Fake timers

Use real `setTimeout` with `await` — fake timers cause subtle issues

---

### Testing internals

Test public API behavior, not implementation details

---

### DOM tests without happy-dom

Packages with DOM need `environment: "happy-dom"` in vitest config

---

### Stale DOM references after re-render in compat-layer tests

`@pyreon/react-compat`, `@pyreon/preact-compat`, etc. do **full DOM subtree replacement on every state change** — there's no VDOM diffing in the compat layer (Pyreon's native pattern is fine-grained reactivity, not whole-component re-renders). A test that captures a button reference BEFORE click and asserts on `.textContent` AFTER click sees the OLD text because the captured node is now detached. **Always re-query the DOM after a state change**: `container.querySelector('#x')!.click(); await flush(); expect(container.querySelector('#x')!.textContent).toBe(...)`. Phase A2's first react-compat smoke held a stale reference and looked like a re-render bug; was actually a test-pattern bug. Reference: `packages/tools/react-compat/src/react-compat-rerender.browser.test.tsx`.

---
