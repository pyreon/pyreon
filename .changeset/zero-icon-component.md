---
'@pyreon/zero': minor
---

`<Icon>` + `createIcon` — minimal inline-SVG leaf for the Image/Link/Script family.

The rendered root **is** the `<svg>` — no wrapper element, no host span, no fixed
size. The consumer wraps and sizes it (`<span style="width:2rem"><Icon/></span>`,
a flex/grid cell, `font-size`). Defaults (`viewBox="0 0 24 24"`,
`fill="currentColor"`, `display:block;width:100%;height:100%`) are all
overridable — every prop spreads straight onto the `<svg>` and wins over the
default. `fill="currentColor"` means CSS `color` themes it (dark mode for free).

```tsx
import { Icon, createIcon } from '@pyreon/zero'

// One-off inline SVG, sized by the consumer's wrapper:
<span style="width:2rem">
  <Icon><path d="M20 6 9 17l-5-5" /></Icon>
</span>

// Reusable glyph component:
export const Check = createIcon('0 0 24 24', <path d="M20 6 9 17l-5-5" />)
<span style="width:48px"><Check class="text-green-600" /></span>
```

Two layers (mirrors `createLink`/`Link`, `createImage`/`Image`): `createIcon`
(one component per glyph) and `Icon` (one-off inline SVG). Intentionally **no
`useIcon` hook** — an icon has no composable behaviour (no async, no state, no
router); a hook layer would be surface for its own sake. New exports: `Icon`,
`createIcon`, `IconProps` (= `SvgAttributes`). Backward-compatible; no existing
API changed.

Verification: 8 real-`h()` happy-dom mount tests in
`packages/zero/zero/src/tests/icon.test.ts` (defaults, prop pass-through /
override, children, `createIcon` glyph + consumer-prop forwarding); manifest
entries (`Icon`, `createIcon`) + regenerated MCP api-reference; snapshot test
count bumped 25 → 27.
