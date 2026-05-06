# @pyreon/manifest

Internal (private) package. Type + identity helper for per-package manifests that feed the monorepo's doc and MCP generators.

Not published to npm. Consumed via workspace protocol by manifest files at `packages/<category>/<pkg>/src/manifest.ts` and by `scripts/gen-docs.ts`.

## Why

Pyreon PRs today synchronize up to 9 documentation surfaces by hand: `CLAUDE.md`, `llms.txt`, `llms-full.txt`, MCP `api-reference.ts`, per-package `README.md`, VitePress `docs/docs/<pkg>.md`, JSDoc, source comments, and `.claude/rules/*.md`. Drift is constant; PR review time is dominated by surface-sync checking.

The manifest approach collapses structured fields (API signatures, examples, common mistakes) to **one source** per package. Free-form prose (guides, conceptual overviews, in-code JSDoc for TSDoc directives like `@deprecated`/`@internal`) stays hand-maintained.

The manifest pipeline (T2.1) and the MCP tools that consume these manifests (T2.5.1-T2.5.8) shipped — see `CLAUDE.md` "Manifest-driven docs pipeline" section for the current state.

## Usage

```ts
// packages/fundamentals/flow/src/manifest.ts
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

### Overloaded APIs — one entry per symbol

A TypeScript function with multiple overload signatures gets **one** `ApiEntry`. The `signature` shows the user-facing primary form (usually the most permissive or most common). Document alternative overloads in the `summary` ("also accepts `(options: X)` form for advanced use") or, when an overload is a footgun, in `mistakes`.

Rationale: MCP search, docs cross-references, and `seeAlso` all key on the symbol name. Splitting overloads into multiple entries fragments the keyspace and surfaces as duplicate hits in AI-assisted lookup. One symbol = one entry.

### Constant-kind semantics

For `kind: 'constant'`, the `signature` field holds the **TYPE of the value**, not a literal. Examples:

```ts
{ name: 'EMPTY_PROPS', kind: 'constant', signature: 'Readonly<Record<string, never>>', ... }
{ name: 'ForSymbol',   kind: 'constant', signature: 'unique symbol', ... }
```

The `example` field shows USE of the constant (import + typical call-site), not its definition. This lets MCP surface constants next to the functions that consume them without leaking implementation details.

### Soft invariants — convention over enforcement

The type definition documents length/shape conventions via `INVARIANT` notes in JSDoc:

- `tagline` ≤120 chars
- `summary` ≤400 chars
- `example` 5-15 lines
- `signature` ≤200 chars, single line
- `features` 3-8 bullets

**These are not enforced by the type.** Authoring tools (your editor, eslint) do not fail on violations. Rationale: strictness here creates friction during authoring (counting chars / bullets) for a payoff that mostly matters for the generated output, which can paper over violations cosmetically. A future lint rule may enforce them once the generator is battle-tested.

Reviewers should flag obvious violations in PR review; the reviewer bar is "does the generated output look right?", not "does every field hit its character budget?".

### `defineManifest` — type narrowing without runtime freeze

`defineManifest<const M>(m)` uses the `const` type-parameter modifier so string literals in the argument are preserved in the returned type (`category: 'browser'` stays `'browser'` instead of widening to the full union). This matters for downstream discriminated-union consumers.

It does NOT `Object.freeze` the manifest at runtime. Consumers can still mutate the returned object; they should not (the generator treats manifests as immutable input), but the ergonomic cost of runtime freezing (surprise `TypeError`s in tests that push to `features`) outweighs the defensive benefit at this stage. Future enforcement (`Object.freeze(deepFreeze(m))` in a production wrapper) is an option once the shape stabilizes.

## What this package does NOT contain

- Generator logic — lives in `scripts/gen-docs.ts` (follow-up PR).
- Manifest entries — those live in consumer packages (`packages/*/*/src/manifest.ts`).
- MCP integration — consumed later in T2.5.1.
- Templates / output formatting — the generator owns those.

The package is intentionally minimal: a type + a one-line helper. Additions must clear a "would a downstream consumer be wrong to access this?" bar.

## Migration

This package ships with no consumers. The follow-up PR adds `scripts/gen-docs.ts` plus the first manifest (`@pyreon/flow`). Subsequent PRs migrate one package at a time; the generator emits output only for packages with manifests and leaves hand-written sections alone for the rest.

## License

MIT
