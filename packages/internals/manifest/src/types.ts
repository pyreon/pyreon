/**
 * Shape of a single public API entry (function, hook, component, type,
 * class, or constant). One entry per exported symbol. Drives generated
 * signatures in `llms-full.txt`, the MCP `api-reference.generated.ts`,
 * and per-package VitePress pages.
 */
export interface ApiEntry {
  /** Exported symbol name — `createFlow`, `useFlow`, `FlowInstance`. */
  name: string
  /**
   * Classification. Controls formatting in generated surfaces (e.g.
   * hooks get grouped into a "Hooks" section in llms-full).
   */
  kind: 'function' | 'hook' | 'component' | 'type' | 'class' | 'constant'
  /**
   * One-line TypeScript signature — no body, no multi-line. The
   * generator inlines this verbatim inside a code fence.
   *
   * This field is hand-maintained and can drift from the real TS type.
   * Convention for high-churn APIs: add `// @check <symbol>` as a
   * sibling comment pointing to the source of truth so reviewers can
   * spot a stale signature in diff. A future lint rule may extract the
   * signature via ts-morph and assert equivalence; out of scope today.
   */
  signature: string
  /**
   * 1-3 sentence description. Feeds the `notes` field in MCP
   * api-reference and the lede of each generated llms-full entry.
   */
  summary: string
  /**
   * Compact 5-15 line code example. Must compile against the real
   * package types. T2.2 (code-example typecheck harness) enforces this
   * on CI; until that ships, authors verify by hand.
   */
  example: string
  /**
   * Common mistakes callers make with this API. Feeds the MCP
   * `validate` tool's Pyreon-specific rules (T2.5.2) and the
   * "Mistakes" section on the generated docs/ page.
   */
  mistakes?: string[]
  /**
   * Related symbols — may reference symbols from this package or
   * another (`createRouter`, `@pyreon/router`). The generator emits
   * cross-references and a future validator resolves them.
   */
  seeAlso?: string[]
  /**
   * API maturity. `'stable'` (default) is included everywhere.
   * `'experimental'` is included in llms-full with a badge, omitted
   * from llms.txt one-liners. `'deprecated'` is surfaced prominently —
   * see the `deprecated` field for metadata.
   */
  stability?: 'stable' | 'experimental' | 'deprecated'
  /**
   * Version the API first shipped in. Feeds the MCP `get_changelog`
   * tool (T2.5.8). Omit for pre-1.0 APIs where history is not tracked.
   */
  since?: string
  /**
   * Deprecation metadata — only meaningful when `stability` is
   * `'deprecated'`. Generator emits a deprecation banner in docs and a
   * `@deprecated` JSDoc hint in MCP output.
   */
  deprecated?: {
    /** Version the API was marked deprecated. */
    since: string
    /** Replacement symbol or pattern — string that goes into user-facing prose. */
    replacement?: string
    /** Planned removal version. Omit if not yet decided. */
    removeIn?: string
  }
}

/**
 * Shape of a single package's manifest. One manifest per package,
 * placed at `packages/<category>/<pkg>/manifest.ts`. Consumed by
 * `scripts/gen-docs.ts` to produce `llms.txt`, `llms-full.txt`, the
 * MCP api-reference, and the CLAUDE.md package table.
 *
 * **Source-of-truth boundary** (decided 9/10 pass):
 * - Structured fields (`signature`, `example`, `mistakes`) — the
 *   manifest is authoritative. Do NOT duplicate them in JSDoc on the
 *   source symbol.
 * - Free-form prose and TSDoc directives (`@deprecated`, `@internal`,
 *   `@see`) — JSDoc on the source symbol remains authoritative. These
 *   do not appear in generated docs and are not tracked by the manifest.
 * - When an entry is marked `deprecated` here, the source symbol
 *   should also carry a `@deprecated` JSDoc tag so IDE quick-info
 *   picks it up. The two are independent surfaces; reviewer checks
 *   they agree.
 *
 * **Ordering of `api[]`** is author-controlled. The generator preserves
 * insertion order across every surface. Convention: public entry points
 * first (typically `createX`/`useX`), then supporting types, then
 * advanced or rare APIs.
 */
export interface PackageManifest {
  /** Package name including scope — `@pyreon/flow`. */
  name: string
  /**
   * One-line tagline — ≤120 chars. Appears in `llms.txt` and the
   * package table in CLAUDE.md.
   */
  tagline: string
  /**
   * Longer paragraph — 2-5 sentences. Appears in the `llms-full.txt`
   * per-package section header and the VitePress docs page lede.
   */
  description: string
  /**
   * Runtime category. Matches the buckets in
   * `.claude/rules/test-environment-parity.md` and drives whether
   * browser smoke tests are required by the
   * `pyreon/require-browser-smoke-test` lint rule.
   */
  category: 'browser' | 'server' | 'universal'
  /**
   * Peer dependencies the package quietly requires but doesn't list
   * in its own `package.json` — typically `@pyreon/runtime-dom` for
   * packages whose JSX emits `_tpl()` / `_bind()` calls.
   */
  peerDeps?: string[]
  /**
   * 3-8 high-level feature bullets. One line each, no trailing
   * punctuation. Drives the `llms-full.txt` per-package section and
   * the CLAUDE.md detail section.
   */
  features: string[]
  /**
   * Exhaustive public API surface. Authors include every symbol
   * exported from `src/index.ts` that third-party code may legitimately
   * reference — functions, hooks, components, types, classes, and
   * semantic constants. Symbols prefixed with `_` are treated as
   * internal and MAY be omitted.
   */
  api: ApiEntry[]
  /**
   * Package-level gotchas not tied to a single API — migration notes,
   * runtime surprises, cross-package interactions. Feeds the Common
   * Issues section in CLAUDE.md and the MCP `diagnose` tool (T2.5.5).
   *
   * Per-API mistakes go on the `mistakes` field of the individual
   * `ApiEntry` instead.
   */
  gotchas?: string[]
  /**
   * Package version the manifest was last audited against. Generator
   * may cross-check against the real `package.json` `version` field in
   * a future PR. Optional for now.
   */
  since?: string
}
