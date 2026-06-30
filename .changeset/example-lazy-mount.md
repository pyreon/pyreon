---
"@pyreon/zero-content": patch
---

`<Example>` now lazy-mounts: each example's chunk is dynamically imported and
mounted only when its wrapper nears the viewport (IntersectionObserver, 400px
rootMargin), instead of eagerly on hydration. A page with many `<Example>`s
(the docs examples gallery has 40+) previously fired every chunk load + mount
on load, streaming content in progressively and pushing LCP out; now
above-the-fold examples load immediately and the rest load just before they
scroll into view (no perceptible delay). Falls back to eager loading when
`IntersectionObserver` is unavailable. The loading-skeleton placeholder is now
`aria-hidden` (it was a roleless `<div>` with `aria-label`, a prohibited-ARIA
attribute that — with many skeletons coexisting below the fold under
lazy-mount — would also have spammed screen readers with repeated "Loading
example" announcements).
