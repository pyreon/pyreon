---
"@pyreon/unistyle": patch
---

Add the `contain-intrinsic-*` responsive style-prop family — `containIntrinsicSize`, `containIntrinsicWidth`, `containIntrinsicHeight`, `containIntrinsicBlockSize`, `containIntrinsicInlineSize` (→ `contain-intrinsic-size` / `-width` / `-height` / `-block-size` / `-inline-size`).

Completes the CSS Containment surface: `contain` and `content-visibility` were already mapped, but `content-visibility: auto` is unusable without a placeholder size — an off-screen element collapses to 0, causing scrollbar jank and an in-view layout shift when it renders. These are the companion props that reserve that space. `simple` passthrough, so the `auto <length>` / two-value forms survive verbatim (e.g. `containIntrinsicSize="auto 800px"`). Additive — all keys optional.
