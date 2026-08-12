---
'@pyreon/compiler': patch
---

Fixes a compile-to-string SSR bug where sibling `.map()` callbacks could swap expressions, producing code that referenced a binding from the wrong scope.

A prop-derived `const` is inlined at its use sites by slicing the ORIGINAL source for its initializer. That is correct on the DOM path — the inlining is what keeps a prop-derived value reactive at the use site — but wrong under SSR the moment the initializer contains JSX: the sliced text is pre-transform, so the JSX is re-emitted verbatim and never lowered, and the raw text drifts against offsets the emit has already shifted.

The observed shape was two sibling `.map()` callbacks. An axis label came out carrying the edge map's path literal, referencing `p1` — a binding that exists only in the other callback's scope — so the page failed to render with `ReferenceError: p1 is not defined`. Under SSG that surfaced as a silently empty page: prerender reports pages attempted rather than rendered, so the build printed "5 prerendered pages" and exited 0 over a 356-byte shell.

Under `ssr`, such a const is now referenced by name instead of inlined — always correct there, since SSR renders once and has no reactivity to preserve. The DOM path is unchanged. Fixed in both backends, with a native-equivalence spec locking the parity.
