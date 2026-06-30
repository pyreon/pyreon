---
"@pyreon/lint": patch
---

Add opt-in frontend rule `pyreon/content-visibility-needs-intrinsic-size` (CLS). Flags `content-visibility: auto` set without `contain-intrinsic-size` — the browser estimates the off-screen box height then corrects it on render, shoving content below it down (a mobile-biased Cumulative Layout Shift, invisible on fast desktop loads). Detects the object-literal form (JSX `style={{}}` + styler/rocketstyle `.theme(() => ({}))`), `css`/`styled` tagged-template CSS, and string `style="…"`. Off by default (opt-in, `frontend` category); enable via the `best-practices` preset or per-rule config; `exemptPaths` supported.
