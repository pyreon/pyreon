---
'@pyreon/zero': minor
---

`iconsPlugin` named multi-sets — per-set typed components, no `IconName` clash.

Builds on `iconsPlugin` (single-set). New `sets` form:

```ts
iconsPlugin({ sets: {
  ui:    { dir: './src/icons/ui' },
  brand: { dir: './src/icons/brand', mode: 'image' },
}})
```

```tsx
import { UiIcon, BrandIcon } from './icons.gen'
<UiIcon name="arrow-left" />     // typed UiIconName
<BrandIcon name="logo-mark" />   // typed BrandIconName — independent union
```

One generated file, one `createNamedIcon` import, a strictly-typed component
PER set under **namespaced** names so two sets never clash: `ui` →
`<UiIcon>` + `type UiIconName`, `brand` → `<BrandIcon>` + `type
BrandIconName`. Per-set binding prefixes (`ui_check` / `brand_check`) keep two
sets sharing a glyph filename collision-free. `mode` is per-set (a colorful
brand set can be `image` while the system set stays `inline`).

`dir` and `sets` are mutually exclusive — the plugin throws `[Pyreon]
iconsPlugin: provide EXACTLY ONE of dir or sets` at config time if both or
neither is given. The dev watcher watches every set's folder; regeneration is
still idempotent. New exports: `IconSetConfig`, `NamedSetInput`,
`generateNamedIconSetsSource`, `componentNameFromSetKey` (server entry);
`IconsPluginConfig.dir` is now optional alongside the new `sets` field.
Backward-compatible — the single-`dir` form is unchanged.

**Not in this PR (explicit follow-up):** monorepo package-sourced sets +
copy-to-public for `mode: 'image'` assets (Vite `emitFile` / stable-URL
contract — its own design).

Verification: pure-generator unit tests (`src/tests/icons-plugin.test.ts` —
`componentNameFromSetKey` PascalCase + sanitize, `generateNamedIconSetsSource`
namespaced-per-set + one shared import + no bare `Icon`/`IconName` + per-set
binding-prefix collision-freedom, `iconsPlugin` dir/sets XOR throw + both
accept-forms); manifest `iconsPlugin` entry updated for the multi-set form +
regenerated MCP api-reference; CLAUDE.md updated. typecheck 0, lint 0,
gen-docs --check clean.
