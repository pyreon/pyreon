---
"@pyreon/runtime-dom": patch
---

test(runtime-dom): add 28 more real tests; branches 86.43% → 86.88%

Two new test files:

**branch-coverage-real-2.test.ts (16 tests)**:
- Transition component-child warn path, string-text child, null child, array child, show toggle false→true and true→false, no `name` prop, custom classnames
- TransitionGroup empty list, multi-item, custom tag, items-signal-change
- KeepAlive basic mount, active=true, active=false, toggle false→true→false

**branch-coverage-prod-mode.test.ts (12 tests)**:
- `NODE_ENV='production'` arms in mount.ts (void-element warn skipped, nested elements, reactive child, null-return component validation skipped) and props.ts (non-function event handler no-warn, unsafe URL still blocked but no warn, event delegation, class/style/dangerouslySetInnerHTML/innerHTML).

Threshold stays at 86 (current 86.88%) with updated rationale comment.
