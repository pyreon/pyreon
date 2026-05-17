---
'@pyreon/zero': minor
---

`<Icon>` + `createIcon` — renders a FULL loaded SVG (Image/Link/Script family).

`<Icon>` does **not** synthesize its own `<svg>` around hand-authored `<path>`
children. You load a complete svg (it already contains the `<svg>` root) and
Icon makes it container-sizable + theme-aware. Two source props:

- `as` — an imported SVG **component** (`import X from './x.svg?component'`).
  Rendered **directly, no host wrapper**; svg attributes forward. Recommended.
- `svg` — the raw `<svg>…</svg>` **markup string**
  (`import x from './x.svg?raw'`). Inlined via a single `<span>` host (a markup
  string can't mount without a parent — this one host is unavoidable).

```tsx
import { Icon, createIcon } from '@pyreon/zero'
import Check from './check.svg?component'
import checkRaw from './check.svg?raw'

<span style="width:2rem"><Icon as={Check} /></span>      // no wrapper
<span style="width:2rem"><Icon svg={checkRaw} /></span>  // one <span> host

export const Star = createIcon(Check)      // component → rendered directly
export const Tick = createIcon(checkRaw)   // raw string → inlined
```

Container-fill defaults (`fill="currentColor"`,
`display:block;width:100%;height:100%`) spread-overridable; no fixed size (the
consumer's wrapper sizes it); `fill="currentColor"` themes via CSS `color`.
Two layers (mirrors `createLink`/`Link`, `createImage`/`Image`):
`createIcon(source)` per-glyph factory + `Icon` one-off. Intentionally **no
`useIcon` hook** — an icon has no composable behaviour. New exports: `Icon`,
`createIcon`, `IconProps` (extends `SvgAttributes`), `SvgComponent`.
Backward-compatible; no existing API changed.

Verification: real-`h()` happy-dom mount tests in
`packages/zero/zero/src/tests/icon.test.ts` (component form renders direct / no
host, raw form inlines via `<span>`, defaults + prop override, `createIcon`
both source kinds, no-source → null); manifest entries (`Icon`, `createIcon`) +
regenerated MCP api-reference; snapshot count 25 → 27.
