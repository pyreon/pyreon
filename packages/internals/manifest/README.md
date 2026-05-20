# @pyreon/manifest

> **Private — internal to the Pyreon monorepo. Not published to npm.**

The schema + identity helper for per-package manifests. Consumed via workspace protocol by `packages/<category>/<pkg>/src/manifest.ts` files and by `scripts/gen-docs.ts`. The single source for everything the docs pipeline generates: `llms.txt` bullets, `llms-full.txt` per-package sections, the MCP `api-reference.ts` regions, and (going forward) VitePress doc pages.

## Why

A Pyreon PR that touches a public API used to need synchronized updates across up to 9 documentation surfaces: `CLAUDE.md`, `llms.txt`, `llms-full.txt`, MCP `api-reference.ts`, per-package `README.md`, VitePress `docs/docs/<pkg>.md`, JSDoc, source comments, and `.claude/rules/*.md`. Drift was constant; PR review time was dominated by surface-sync checking.

The manifest collapses structured fields (API signatures, examples, common mistakes, peer deps, gotchas, feature bullets) to **one source** per package. Free-form prose (guides, conceptual overviews, TSDoc directives like `@deprecated`/`@internal`) stays hand-maintained where it belongs.

## Quick start

```ts
// packages/fundamentals/flow/src/manifest.ts
import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/flow',
  tagline: 'Reactive flow diagrams — signal-native nodes, edges, pan/zoom, elkjs auto-layout',
  description:
    'Reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom via pointer events, ' +
    'auto-layout via lazy-loaded elkjs. No D3.',
  category: 'browser',
  peerDeps: ['@pyreon/runtime-dom'],
  features: [
    'createFlow<TData> generic over node data shape',
    'useFlow(config) auto-disposes on unmount',
    'Custom node/edge renderers with reactive accessor props',
  ],
  api: [
    {
      name: 'createFlow',
      kind: 'function',
      signature: '<TData = Record<string, unknown>>(config: FlowConfig<TData>) => FlowInstance<TData>',
      summary: 'Create a reactive flow instance. Generic over node data shape.',
      example: 'const flow = createFlow<MyData>({ nodes: [...], edges: [...] })',
      mistakes: [
        'Missing @pyreon/runtime-dom in consumer deps — flow JSX emits _tpl() which needs it',
      ],
      seeAlso: ['useFlow'],
    },
  ],
  gotchas: [
    'LayoutOptions.direction applies to layered/tree only; force/stress/radial ignore it',
  ],
})
```

## Exports

| Export | Purpose |
|---|---|
| `defineManifest<const M>(m)` | Identity helper — preserves string-literal types via the `const` type-parameter modifier so `category: 'browser'` stays `'browser'` and discriminated unions narrow correctly. No runtime wrap, no freeze. |
| `PackageManifest` | Top-level manifest shape — `name`, `tagline`, `description`, `category`, `peerDeps`, `features`, `api`, `gotchas`, `longExample`, `title`, `since`. |
| `ApiEntry` | One per exported symbol — `name`, `kind`, `signature`, `summary`, `example`, `mistakes`, `seeAlso`, `stability`, `since`, `deprecated`. |
| `ApiKind` | `'function' \| 'hook' \| 'component' \| 'type' \| 'class' \| 'constant'` — controls how the generator groups + formats entries. |
| `Gotcha` | Bare `string` (rendered as `> **Note**: …`) or `{ label, note }` (rendered as `> **<label>**: …`). |
| `SemVer` | `${number}.${number}.${number}` template-literal type — catches `'1'` / `'v1.0.0'` / `'1..0.0'` typos. |
| `findManifests()` | Walks the monorepo and loads every `packages/**/src/manifest.ts`. Returns `LoadedManifest[]` with category + filesystem path. |
| `getPackageCategories()` | Returns the canonical category list (`'core' | 'fundamentals' | 'tools' | 'ui-system' | 'zero' | 'internals' | 'ui'`). |
| `renderLlmsTxtLine(m)` | One-line bullet for `llms.txt`. |
| `renderLlmsFullSection(m)` | Per-package section for `llms-full.txt`. |
| `renderApiReferenceBlock(m)` | MCP api-reference block (between `<gen-docs:api-reference:start/end @pyreon/<name>>` markers). |
| `renderApiReferenceEntries(m)` | Lower-level — emit each `api[]` entry as `McpApiReferenceEntry`. |
| `McpApiReferenceEntry` | Type structurally locked equal to MCP's real `ApiEntry` via a compile-time `Equal<...>` check in the MCP package's tests. Any drift fails `tsc --noEmit`. |
| `formatLineDiff(a, b)` | Used by `gen-docs --check` to print a colored diff when generated output drifts from committed. |

## Design decisions

### Source-of-truth boundary

| Field | Authoritative source | Rationale |
|---|---|---|
| `signature` | Manifest | Hand-maintained string; lives next to all other generated inputs. |
| `summary` | Manifest | User-facing copy — reviewed as docs, not source-adjacent technical prose. |
| `example` | Manifest | Single location for docs + MCP + llms-full. |
| `mistakes` | Manifest | Feeds MCP `validate` — needs structured access. |
| `seeAlso` | Manifest | Generator emits cross-references; future validator resolves them. |
| `@deprecated` JSDoc on symbol | Source | IDE quick-info needs it; pair with `stability: 'deprecated'` here. |
| `@internal` JSDoc on symbol | Source | Controls TS doc generation. |
| Conceptual prose in `docs/guide/**/*.md` | Source | Not a structured API reference. |

### One entry per overloaded symbol

A TypeScript function with N overload signatures gets **one** `ApiEntry`. The `signature` shows the user-facing primary form (usually the most permissive); alternative overloads go in `summary` ("also accepts `(options: X)` form") or in `mistakes` when they're footgun-prone. MCP search, docs cross-references, and `seeAlso` all key on the symbol name — splitting overloads fragments the keyspace.

### `kind: 'constant'` carries the TYPE, not a value

```ts
{ name: 'EMPTY_PROPS', kind: 'constant', signature: 'Readonly<Record<string, never>>', ... }
{ name: 'ForSymbol',   kind: 'constant', signature: 'unique symbol', ... }
```

The `example` shows USE of the constant (import + call-site), not its definition.

### Soft invariants — convention, not enforced

The `PackageManifest` JSDoc documents length/shape conventions: `tagline` ≤120 chars, `summary` ≤400, `example` 5-15 lines, `signature` ≤200 chars and single-line, `features` 3-8 bullets. **The types do not enforce these.** Strictness here creates authoring friction (counting chars) for a payoff that mostly matters cosmetically in the generated output. Reviewers should flag obvious violations; future lint rules may enforce once the generator is battle-tested.

### `defineManifest` — type narrowing, no runtime freeze

`defineManifest<const M>(m)` uses the `const` type-parameter modifier so string literals are preserved. It does NOT `Object.freeze` at runtime. Consumers SHOULD treat the returned object as immutable; runtime freezing would surface as surprise `TypeError`s in tests and the ergonomic cost outweighs the defensive benefit at this stage.

## Discovery

`findManifests()` walks the monorepo and loads every `packages/**/src/manifest.ts`. It's used by `scripts/gen-docs.ts` to drive regeneration and by `scripts/check-manifest-depth.ts` (the MCP `get_api` density ratchet). Both consumers go through this loader rather than scanning the filesystem — `manifest.ts` files are NOT shipped in published `lib/` (they're gen-docs-only) so any consumer reading them at runtime would break.

## What this package does NOT contain

- Generator logic — lives in `scripts/gen-docs.ts`.
- Manifest content — lives in consumer packages' `src/manifest.ts`.
- MCP runtime — lives in `@pyreon/mcp`.
- Output formatting — `render.ts` here is the layout primitives only; templating + filesystem are the generator's job.

Additions must clear a "would a downstream consumer be wrong to access this?" bar. The package is intentionally minimal.

## License

MIT (private to the Pyreon monorepo).
