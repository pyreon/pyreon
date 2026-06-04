---
"@pyreon/elements": patch
---

test(elements): add 5 real tests for Iterator simple-array path

`branch-coverage-95-floor.test.tsx` adds:
- Iterator `itemKey` as function for SIMPLE array (existing tests use complex arrays)
- Iterator empty simple array → null
- Iterator empty complex array → null
- Iterator without data → null
- Element WRAPPER_DEV_PROPS prod-mode arm via vi.resetModules

Branches: 91.27% → 91.98% (+0.71pp). Threshold unchanged (91); doc-comment
added to vitest.config.ts noting structural ceiling for unit tests.

The remaining gap to MINIMUM_BRANCH_FLOOR=95 is in browser-only paths
(Element equalize ResizeObserver, useOverlay positioning, Iterator/Wrapper
defensives) exercised by elements.browser.test.tsx + ui-showcase e2e.
