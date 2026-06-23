---
"@pyreon/styler": minor
---

`styled()` components now accept `innerRef` as a `ref` alias, uniform with `@pyreon/elements` Element (which has always supported `innerRef`). Previously `<Styled innerRef={fn}>` silently dropped the ref — the callback never fired (e.g. a `@pyreon/virtual` scroll container mounted via `innerRef` was never captured, leaving the virtualized list empty). A styled component renders a single DOM node, so `ref` already targets it; `innerRef` is now normalized to `ref` at both the static and dynamic component paths (explicit `ref` wins; `innerRef` is never forwarded to the DOM as an attribute). Getter-shaped reactive props and symbol-keyed brands are preserved through the normalization. Zero-cost when `innerRef` isn't used.
