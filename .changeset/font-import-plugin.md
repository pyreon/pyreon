---
'@pyreon/zero': minor
---

`?font` import — auto-generated `@font-face` + hashed-URL descriptor.

The original DX gap: even with `usePreloadFont('/fonts/display-bold.woff2')` (PR #1359), users still had to hand-write `@font-face` CSS AND keep a string path in sync with the file location. Now:

```tsx
import display from './fonts/display-bold.woff2?font'

export default function Hero() {
  return <h1 style={`font-family: ${display.family}`}>Hero</h1>
}
```

Mirrors `?optimize` for images. Build-time plugin:

1. **Hashes + copies** to `dist/assets/fonts/<name>-<hash8>.woff2` (content-addressed; same content at different paths dedup to one file)
2. **Auto-generates `@font-face`** — bundled as a side-effect CSS import, no user CSS needed
3. **Auto-extracts `family` / `weight` / `style`** from filename:
   - `display-bold.woff2` → `{ family: 'display', weight: 700, style: 'normal' }` (`bold` is a known weight keyword)
   - `inter-700.woff2` → `{ family: 'inter', weight: 700, style: 'normal' }`
   - `inter-700-italic.woff2` → `{ family: 'inter', weight: 700, style: 'italic' }`
   - Override via query: `?font&family=Display&weight=900&style=italic`
4. **Returns a typed `FontDescriptor`** with `toString()` / `valueOf()` / `Symbol.toPrimitive` all returning the family name (so `font-family: ${descriptor}` interpolation works — same compat-guardrail shape as `ProcessedImage`)
5. **`Object.freeze`d** — accidental mutation throws `TypeError`

**Auto-wired** by `zero({ font })` — same opt-out flag as `fontPlugin`. `zero({ font: false })` opts both out. `zero()` (default) wires `pyreon-zero-images` + `pyreon-zero-fonts` + `pyreon-zero-font-import`. No cost when no `?font` queries are used.

**Ambient types** ship at `@pyreon/zero/font-types` — one `/// <reference types="@pyreon/zero/font-types" />` in any tsconfig-covered `.d.ts` makes all five extensions (`.woff2` / `.woff` / `.ttf` / `.otf` / `.eot`) type-check out of the box.

**Pair with `usePreloadFont`** for LCP-critical fonts — pass `descriptor.src` directly (or the descriptor itself once PR #1359 merges and the helper accepts FontDescriptor):

```tsx
import display from './fonts/display-bold.woff2?font'
import { usePreloadFont } from '@pyreon/zero'

export default function Hero() {
  usePreloadFont(display.src)  // hashed URL — never drifts
  return <h1 style={`font-family: ${display.family}`}>Hero</h1>
}
```

**56 specs** lock the contract:
- **40 helper specs** in `font-import-plugin-helpers.test.ts`: `fontMimeType` / `fontFormat` per-extension + case-insensitive; `inferFontMeta` family/weight/style extraction (all 15 weight keywords, italic/oblique, underscore tokenizer, non-3-digit numeric edge cases, full-path stripping); `parseFontQueryOverrides` (family/weight/style/garbage-rejection/empty); `hashFontFilename` (deterministic, content-addressed dedup, extension preservation); `buildFontFace` (declarations + structure); `emitFontDescriptorModule` (side-effect import + frozen + toString chain + JSON escaping).
- **16 plugin lifecycle specs** in `font-import-plugin.test.ts`: `resolveId` (catches `?font`, preserves overrides, ignores non-font + unknown extensions, accepts all 5, passes CSS virtual ids through); `load` build mode (emits Vite asset + descriptor); `load` dev mode (`/@fs/` src); descriptor structure (frozen, toString); filename inference vs query overrides; CSS virtual id (returns `@font-face` rule); error handling (missing file).
- **9 auto-wire specs** in `zero-auto-wire-plugins.test.ts` updated for the new `pyreon-zero-font-import` plugin.
- **6 packaging specs** in `font-types-export.test.ts` lock the published surface (buildable .ts source, no stray .d.ts, package.json exports, self-ref import, all 5 extensions declared, no top-level import/export).

**Bisect-verified at 2 layers**: (a) removing the `fontImportPlugin()` push from the auto-wire block fails 2/9 auto-wire specs with `expected to include 'pyreon-zero-font-import'`; (b) flipping `resolveId`'s CSS-virtual-id branch fails the `returns CSS virtual ids as-is` spec; restored → 71/71 PR D specs pass.

**23/23 verify-modes** cells stay green (SSG/SSR/ISR/SPA × per-adapter × islands × native).

`@pyreon/zero/font-import-plugin` exports: `fontImportPlugin` (Vite plugin), `FontDescriptor` + `FontImportPluginConfig` (types), and the pure helpers `fontMimeType` / `fontFormat` / `inferFontMeta` / `parseFontQueryOverrides` / `hashFontFilename` / `buildFontFace` / `emitFontDescriptorModule` (exposed for testing + advanced integrations).
