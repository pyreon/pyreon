---
"@pyreon/styler": patch
---

Extend the dev-mode resolved-CSS validator (`sheet.insert`) to warn on `content-visibility: auto` resolved without `contain-intrinsic-size` — a Cumulative Layout Shift footgun (the browser estimates the off-screen box height then corrects it on render, shifting content below). This is the runtime safety net complementing the static `pyreon/content-visibility-needs-intrinsic-size` lint rule: it catches the case where the CSS is computed at runtime, which the static rule can't see. Dev-only (tree-shaken from production), warns once per finding, ReDoS-safe scan.
