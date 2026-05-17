---
'@pyreon/zero': minor
---

`iconsPlugin` + `createNamedIcon` — point at a folder of SVGs, get a strictly-typed `<Icon name="…" />`.

`iconsPlugin({ dir })` (from `@pyreon/zero/server`) scans `*.svg`, derives a
kebab `name` from each filename, and writes a gitignored generated
`icons.gen.tsx` that exports a strictly-typed `<Icon>`. Add an svg → the `name`
union widens; remove one → an invalid `name` fails typecheck. Regenerates on
add/unlink in dev (idempotent — never rewrites identical content).

```ts
// vite.config.ts
import { iconsPlugin } from '@pyreon/zero/server'
plugins: [iconsPlugin({ dir: './src/icons' })]
```

```tsx
// app — autocompletes, rejects typos, real go-to-definition:
import { Icon } from './icons.gen'
<span style="width:2rem"><Icon name="check-circle" /></span>
```

The generated file calls `createNamedIcon(REGISTRY)`, so `keyof typeof
REGISTRY` IS the type surface — zero per-app wiring. It writes a **real file**
(not a virtual module) deliberately: the published `@pyreon/zero` can't
`import` a plugin virtual module (Rolldown resolves static imports before
plugin `resolveId` — the same constraint that makes islands need
`hydrateIslandsAuto(registry)` with an explicit import).

Two render modes per the colorful-vs-system split:

- `mode: 'inline'` (default) — **system icons**. Each svg inlined as `?raw`
  markup via `Icon`; `currentColor`-themeable, recolor via CSS `color`.
- `mode: 'image'` — **colorful / brand icons**. Each svg emitted as a static
  asset, rendered `<img>`. NO mutation, original colors preserved.

`createNamedIcon<R>(registry, { mode? })` is the exported runtime half (typed
by `keyof R`) — normally called by the generated file, callable directly for a
hand-maintained set. New exports: `iconsPlugin`, `iconNameFromFile`,
`scanIconDir`, `generateIconSetSource`, `IconsPluginConfig` (server entry);
`createNamedIcon`, `IconMode`, `NamedIconProps` (client entry). Builds on the
`Icon` / `createIcon` leaf; backward-compatible, no existing API changed.

**Not in this PR (explicit follow-up):** named multi-sets (per-set typed
`<UiIcon>` / `<BrandIcon>`, no `IconName` clash) + monorepo package-sourced
sets + copy-to-public for `mode: 'image'` assets.

Verification: pure scanner/generator unit tests
(`src/tests/icons-plugin.test.ts` — `iconNameFromFile` kebab cases,
`scanIconDir` filter/sort/missing-dir, `generateIconSetSource` inline vs image
+ binding-collision guard + empty set) and real-`h()` happy-dom mount tests for
`createNamedIcon` both modes (`src/tests/icon.test.ts`); manifest entries
(`iconsPlugin`, `createNamedIcon`) + regenerated MCP api-reference; snapshot
count 27 → 29.
