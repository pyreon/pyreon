---
"@pyreon/compiler": patch
---

fix(compiler): array-of-JSX / map-of-JSX consts used as a bare `{x}` child now MOUNT instead of stringifying. Previously `const arr = [<a/>, <b/>]; <div>{arr}</div>` (or `const rows = items.map(i => <li/>); <ul>{rows}</ul>`) baked to `textContent = arr`, rendering `[object Object],[object Object]`. The compiler's element-binding tracking now recognizes array-of-JSX and map-of-JSX const initializers (`isJsxCollectionInit`, mirrored 1:1 in the Rust backend) and routes them through `_mountSlot` → `mountChild`, which renders arrays element-by-element. String/number consts stay on the text fast path (no over-classification). Cross-backend byte-equivalence verified.
