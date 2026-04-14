/**
 * SemVer string literal — `MAJOR.MINOR.PATCH`. Template-literal type that
 * catches common typos like `'1'`, `'0..1.0'`, or `'v1.0.0'` at compile
 * time. Does not validate ranges (any number is accepted) or the full
 * semver spec (prerelease / build metadata). For manifest usage that's
 * acceptable — the generator only needs a parseable version string.
 */
export type SemVer = `${number}.${number}.${number}`

/**
 * Classification of an exported symbol. Controls formatting in
 * generated surfaces (e.g. hooks group into a "Hooks" section in
 * llms-full; types list separately; components get JSX-call examples).
 *
 * - `function` — named or arrow function. `signature` is a TS call
 *   signature: `(x: T) => U`.
 * - `hook` — function whose name begins with `use`. Same `signature`
 *   form as function; groups separately in docs.
 * - `component` — JSX-callable function returning `VNodeChild`.
 *   `signature` is typically `ComponentFn<Props>`.
 * - `type` — interface / type alias / class type export. `signature`
 *   is the type's canonical form (first-line representation for long
 *   types).
 * - `class` — exported class. `signature` is the constructor signature.
 * - `constant` — named value export (e.g. a `Symbol`, a readonly
 *   tuple). `signature` gives the TYPE of the constant, not a value
 *   literal: `readonly [1, 2, 3]` or `unique symbol`.
 */
export type ApiKind = 'function' | 'hook' | 'component' | 'type' | 'class' | 'constant'

/**
 * Shape of a single public API entry (function, hook, component, type,
 * class, or constant). One entry per exported symbol. Drives generated
 * signatures in `llms-full.txt`, the MCP `api-reference.generated.ts`,
 * and per-package VitePress pages.
 *
 * ## Overload handling
 * A TypeScript function with multiple overload signatures gets ONE
 * `ApiEntry`. Its `signature` shows the user-facing primary form
 * (usually the most permissive). Document the alternative overloads in
 * the `summary` or, if they're footgun-prone, in `mistakes`. Rationale:
 * tools like MCP and docs want one entry per named symbol; separating
 * overloads fragments search and confuses consumers.
 */
export interface ApiEntry {
  /** Exported symbol name — `createFlow`, `useFlow`, `FlowInstance`. */
  name: string
  /**
   * Classification. See `ApiKind` for the semantics of each value.
   * Controls formatting in generated surfaces.
   */
  kind: ApiKind
  /**
   * One-line TypeScript signature — no body, no multi-line. The
   * generator inlines this verbatim inside a code fence.
   *
   * For `function` / `hook` / `component` / `class`: a TS call or
   * constructor signature.
   * For `type`: the first-line canonical form (`interface X { ... }`
   * or `type X = ...`).
   * For `constant`: the TYPE of the value (`readonly number[]`,
   * `unique symbol`), not a value literal.
   *
   * This field is hand-maintained and can drift from the real TS type.
   * Convention for high-churn APIs: add `// @check <symbol>` as a
   * sibling comment in the source file pointing to the canonical
   * definition so reviewers can spot a stale signature in diff. A
   * future lint rule may extract the signature via ts-morph and assert
   * equivalence; out of scope today.
   *
   * INVARIANT (convention, not enforced): ≤200 chars, single line, no
   * trailing whitespace. Longer types should be split into a `type`
   * entry referenced by the main entry.
   */
  signature: string
  /**
   * 1-3 sentence description. Feeds the `notes` field in MCP
   * api-reference and the lede of each generated llms-full entry.
   *
   * INVARIANT (convention, not enforced): ≤400 chars.
   */
  summary: string
  /**
   * Compact code example. Must compile against the real package types.
   * T2.2 (code-example typecheck harness) enforces this on CI; until
   * that ships, authors verify by hand.
   *
   * INVARIANT (convention, not enforced): 5-15 lines. Longer examples
   * belong in the package's VitePress guide, not the manifest.
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
   * Must be `MAJOR.MINOR.PATCH` form.
   */
  since?: SemVer
  /**
   * Deprecation metadata — only meaningful when `stability` is
   * `'deprecated'`. Generator emits a deprecation banner in docs and a
   * `@deprecated` JSDoc hint in MCP output.
   */
  deprecated?: {
    /** Version the API was marked deprecated. */
    since: SemVer
    /** Replacement symbol or pattern — string that goes into user-facing prose. */
    replacement?: string
    /** Planned removal version. Omit if not yet decided. */
    removeIn?: SemVer
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
   * Runtime category. Drives whether browser smoke tests are required
   * by the `pyreon/require-browser-smoke-test` lint rule and whether
   * `typeof process` is an acceptable dev-gate pattern.
   *
   * **Source of truth**: `.claude/rules/test-environment-parity.md`
   * owns the category definitions and the canonical per-package
   * assignments; the rule file's machine-readable list is at
   * `.claude/rules/browser-packages.json`. This literal union must
   * stay aligned with those. If a new category is added to the rule
   * file (e.g. `'worker'`), widen this union in the same PR.
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
   * a future PR. Must be `MAJOR.MINOR.PATCH`.
   */
  since?: SemVer
}
