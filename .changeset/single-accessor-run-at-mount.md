---
'@pyreon/runtime-dom': patch
---

Textish reactive accessor children now run ONCE at mount instead of twice. `mountChild` used to invoke every function child two times: an untracked classification sample plus the chosen binding machinery's own tracked first run (~12,000 accessor invocations for a 6,000-cell table mount — the `@pyreon/table` bench finding). Classification now happens inside the binding's first tracked run (`mountAccessorChild`), so string/number/boolean-initial accessors — per-cell formatters, labels, `_mountSlot` component children — execute exactly once, with identical subscriptions, context-owner capture, and polymorphic text→VNode upgrade behavior. Structural accessors (keyed-array and VNode/null initials) deliberately keep the previous two-invocation handoff to `mountKeyedList`/`mountReactive`, preserving their effect()-grade semantics (ErrorBoundary routing, onUpdate notification, re-entrant generation guard). Compiled template bindings (`_bindText`/`bindPolymorphicText`) were always single-call and are unchanged. Measured on the table bench's h()-path mount at 1k rows × 6 cols: 57.4–60.1ms → 52.8–53.9ms (~10%).

Note: an accessor with side effects (impure user code) now observably runs once at mount rather than twice on these paths.
