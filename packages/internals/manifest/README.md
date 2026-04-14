# @pyreon/manifest

Internal (private) package. Type + identity helper for per-package manifests that feed the monorepo's doc and MCP generators.

Not published to npm. Consumed via workspace protocol by manifest files at `packages/<category>/<pkg>/manifest.ts` and by `scripts/gen-docs.ts` (separate PR).

## Why

Pyreon PRs today synchronize up to 9 documentation surfaces by hand: `CLAUDE.md`, `llms.txt`, `llms-full.txt`, MCP `api-reference.ts`, per-package `README.md`, VitePress `docs/docs/<pkg>.md`, JSDoc, source comments, and `.claude/rules/*.md`. Drift is constant; PR review time is dominated by surface-sync checking.

The manifest approach collapses structured fields (API signatures, examples, common mistakes) to **one source** per package. Free-form prose (guides, conceptual overviews, in-code JSDoc for TSDoc directives like `@deprecated`/`@internal`) stays hand-maintained.

See `.claude/plans/ecosystem-improvements-2026-q2.md` → T2.1 for the broader context and T2.5.x for the MCP tools that will consume these manifests.

## Usage

```ts
// packages/fundamentals/flow/manifest.ts
import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/flow',
  tagline: 'Reactive flow diagrams — signal-native nodes, edges, pan/zoom, elkjs auto-layout',
  description:
    "Reactive flow diagrams for Pyreon. Signal-native nodes and edges, pan/zoom via pointer events, " +
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
      example: `const flow = createFlow<MyData>({ nodes: [...], edges: [...] })`,
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

## Design decisions

### Source-of-truth boundary

For each field that appears both in a manifest and somewhere in source (JSDoc, comments):

| Field on `ApiEntry` | Authoritative source | Rationale |
|---|---|---|
| `signature` | Manifest (with optional `// @check` source comment) | Hand-maintained string; lives next to all other generated inputs |
| `summary` | Manifest | Reviewed as user-facing copy, not source-adjacent technical prose |
| `example` | Manifest | Single location for doc + MCP + llms-full; easier to typecheck uniformly |
| `mistakes` | Manifest | Feeds MCP `validate` tool — needs structured access |
| `seeAlso` | Manifest | Cross-references validated by generator |
| `@deprecated` JSDoc on symbol | Source | IDE quick-info needs it; `stability: 'deprecated'` on the manifest is redundant with it and both should agree |
| `@internal` JSDoc on symbol | Source | Controls TypeScript doc generation; not relevant to user-facing docs |
| Free-form prose in `docs/guide/**/*.md` | Source | Conceptual content, not a structured API reference |

### Signature drift

`ApiEntry.signature` is hand-maintained and can drift from the real TS type. For high-churn APIs, annotate the source symbol with a sibling comment like `// @check FlowConfig` so reviewers can spot a stale manifest signature in diff. A future lint rule may extract the signature via `ts-morph` and assert equivalence; out of scope today.

### API array ordering

`PackageManifest.api[]` is author-controlled. The generator preserves insertion order across every surface. Convention: public entry points first (typically `createX`/`useX`), then supporting types, then advanced or rare APIs. Do not alphabetize — usage-relevance beats A-Z.

## What this package does NOT contain

- Generator logic — lives in `scripts/gen-docs.ts` (follow-up PR).
- Manifest entries — those live in consumer packages (`packages/*/*/manifest.ts`).
- MCP integration — consumed later in T2.5.1.
- Templates / output formatting — the generator owns those.

The package is intentionally minimal: a type + a one-line helper. Additions must clear a "would a downstream consumer be wrong to access this?" bar.

## Migration

This package ships with no consumers. The follow-up PR adds `scripts/gen-docs.ts` plus the first manifest (`@pyreon/flow`). Subsequent PRs migrate one package at a time; the generator emits output only for packages with manifests and leaves hand-written sections alone for the rest.

## License

MIT
