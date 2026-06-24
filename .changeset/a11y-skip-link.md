---
"@pyreon/a11y": minor
---

Add `<SkipLink>` — a keyboard "skip to content" link (WCAG 2.4.1 Bypass Blocks). Render it as the first focusable element on the page: it stays clipped out of view until focused (first Tab), then appears at the top-left, and activating it moves BOTH scroll and keyboard focus to the target landmark (default `#main`) — adding a programmatic-focus `tabindex` automatically when the target isn't natively focusable. A `style` object merges over the built-in reveal styles to restyle the focused appearance without losing the hide-until-focus behavior.
