---
"@pyreon/styler": patch
"@pyreon/runtime-dom": patch
---

Fix three defects surfaced by an upstream consumer's hardening pass.

**FW-1 (crash):** a getter-shaped `ref`/`innerRef` on a reactive styled component crashed `DynamicStyled`. The compiler `_rp`-wraps any props-derived JSX prop and `makeReactiveProps` makes it a getter-only descriptor, which `buildProps` descriptor-copies — so `finalProps.ref = wrapper` (plain assignment) threw `Cannot set property ref … which has only a getter`, taking down the whole styled subtree (every rocketstyle/elements component receiving `innerRef={props.innerRef}`). Now defines the wrapper via `Object.defineProperty` (a data descriptor) — the documented "companion writes must use defineProperty, not assignment" rule.

**LR-3 (a11y):** the styler prop allowlist (`HTML_PROPS_LIST`) contained the React-compat `htmlFor` but not the standard `for`, so a bare `<Label for="x">` on a styled/rocketstyle component silently dropped the `for` attribute, severing the label↔input association. Added `for` to the allowlist.

**FW-3:** conditional-slot removal (`{cond && <X/>}` / `<Show>` / ternary) no-op'd when the mount root was detached from `document`, leaking the old node and accumulating new ones — because the removal guard was `parent.isConnected !== false`. That conflated "detached by `clearBetween`" (a `DocumentFragment`, the case the skip optimizes) with "the whole root is a detached Element" (common in unit tests, which were thereby blind to removal regressions). The skip now keys on `nodeType === 11` (DocumentFragment).
