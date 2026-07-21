# @pyreon/tsconfig

Internal (private) shared **tsconfig presets** — the single source of truth for
the monorepo's TypeScript options. Before this package, 100+ `tsconfig.json`
files repeated the same `outDir`/`rootDir`/`jsx`/`types` block in ~9 slightly
drifted variants.

## Presets

| Preset | Extends | Use for |
| --- | --- | --- |
| `base.json` | `@vitus-labs/tools-typescript/lib` | The repo root `tsconfig.json` (canonical options: bun `customConditions`, `exactOptionalPropertyTypes`, `jsx: preserve` + `jsxImportSource: @pyreon/core`, ES2024 libs) |
| `lib.json` | `base.json` | A framework package with **no JSX** in src/tests (`outDir`/`rootDir`/`include` via `${configDir}`, `types: [vitest/globals, node]`) |
| `lib-jsx.json` | `lib.json` | A framework package **with JSX** (`jsx: react-jsx` for `tsc --noEmit` + editor; builds still emit via the real Pyreon compiler) |
| `example.json` | `base.json` | An `examples/*` app (`noEmit`, relaxed `exactOptionalPropertyTypes`, includes `vite.config.ts`) |

## How to consume

Relative `extends` — the depth is uniform for every package category, so no
per-package devDependency or lockfile entry is needed:

```jsonc
// packages/<category>/<pkg>/tsconfig.json
{ "extends": "../../internals/tsconfig/lib-jsx.json" }

// examples/<name>/tsconfig.json
{ "extends": "../../packages/internals/tsconfig/example.json" }
```

Per-package deviations stay where they belong — as explicit overrides in that
package's `tsconfig.json` on top of the preset (extra `types`, `references`,
`paths`, …). If you need a new *repo-wide* option, change `base.json` — never
copy an option into N package files.

`${configDir}` (TS ≥5.5) makes the presets' path options (`outDir`,
`rootDir`, `include`) resolve against the EXTENDING package's directory —
the historical reason every package had to repeat them inline.

## Guard

`scripts/check-tsconfig-presets.ts` (in `validate-fast` + pre-push) asserts
every package/example tsconfig extends a preset (or is on the documented
exemption list with a rationale), so the consolidation can't silently erode.
