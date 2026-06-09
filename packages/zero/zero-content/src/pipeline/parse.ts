import matter from 'gray-matter'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified, type Processor } from 'unified'
import type { Root } from 'mdast'
import { emitJsx, type EmitOptions } from './emit-jsx'
import { remarkCallout } from './remark-plugins/callout'
import { remarkCodeGroup } from './remark-plugins/codegroup'
import { remarkMathMermaidDetails } from './remark-plugins/math-mermaid-details'
import { highlightCode, type HighlighterOptions } from './highlighter'
import { slugFromPath } from '../_shared/derive-slug'
import type { Heading } from '../types'

// ─── PR-G audit H12 — processor cache ─────────────────────────────────────
//
// The remark/unified processor's plugin chain (parse → frontmatter →
// gfm → directive → callout → codegroup → optional mdx) is identical
// across every file in the project. Pre-fix we built a fresh
// `unified()` instance per `compileMarkdown` call — 7-8 `.use(...)`
// allocations + the chain initialization × N files. That's wasted
// work the audit (H12) called out.
//
// We can't share the FULL processor because `remarkCallout` is
// parameterized per-file (`{ source, warnings }` — it reads the body
// to detect unclosed `:::` fences and pushes diagnostics into the
// caller's array). The fix: pass that context via a module-level
// thread-local set right before `processor.parse(body)` and read by
// a thin parameterless wrapper plugin. Single-threaded JS makes this
// safe — no other code runs between the assignment and the parse.

let _currentCalloutContext: {
  source: string
  warnings: string[]
} | null = null

/** Internal — thin wrapper around `remarkCallout` that pulls its
 * options from the module-level thread-local set by `compileMarkdown`
 * right before `processor.run`. Keeps the cached processor's plugin
 * configuration parameterless. The OUTER call (at `.use(...)` time,
 * processor build) returns the transformer; the INNER read of
 * `_currentCalloutContext` happens at `processor.run` time when the
 * caller has set the context. */
function remarkCalloutThreadLocal(this: unknown) {
  // Return a transformer that, per-run, reads the thread-local + the
  // already-cached `remarkCallout` factory. `remarkCallout(opts)` is
  // a cheap factory (constructs a closure); the structural saving is
  // in the OTHER plugins (parse, gfm, mdx) staying built once.
  return function transformer(tree: Root): void {
    const ctx = _currentCalloutContext
    if (ctx === null) {
      throw new Error(
        '[@pyreon/zero-content] internal: remarkCalloutThreadLocal invoked without context — compileMarkdown contract violated',
      )
    }
    const innerTransformer = remarkCallout({
      source: ctx.source,
      warnings: ctx.warnings,
    })
    ;(innerTransformer as (t: Root) => void)(tree)
  }
}

// Two cached processors, keyed by the `mdxEnabled` flag — the only
// configuration that varies between calls. Lazy-built on first use.
let _processorMdx: Processor | null = null
let _processorNoMdx: Processor | null = null

function getProcessor(mdxEnabled: boolean): Processor {
  if (mdxEnabled) {
    if (_processorMdx === null) _processorMdx = buildProcessor(true)
    return _processorMdx
  }
  if (_processorNoMdx === null) _processorNoMdx = buildProcessor(false)
  return _processorNoMdx
}

/** Thin wrapper around `remarkMathMermaidDetails` that pulls its
 * options (the source string for verbatim math/mermaid extraction)
 * from the same thread-local context used by remarkCallout. */
function remarkMathMermaidDetailsThreadLocal() {
  return function transformer(tree: Root): void {
    const ctx = _currentCalloutContext
    const opts = ctx ? { source: ctx.source } : {}
    const inner = remarkMathMermaidDetails(opts)
    ;(inner as (t: Root) => void)(tree)
  }
}

function buildProcessor(mdxEnabled: boolean): Processor {
  const base = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkCalloutThreadLocal)
    .use(remarkCodeGroup)
    // PR-M audit M6+M7+M8 — recognise `:::math` / `:::mermaid` /
    // `:::details` directives. Runs AFTER callout + codegroup so
    // unknown names land in those plugins' diagnostic surfaces
    // first; this one only handles its own three.
    .use(remarkMathMermaidDetailsThreadLocal)
  return mdxEnabled
    ? (base.use(remarkMdx) as unknown as Processor)
    : (base as unknown as Processor)
}

/**
 * @internal Reset the cached processors. Test-only — lets a spec
 * exercise the build-from-scratch path without relying on module
 * unloading order.
 */
export function _resetProcessorCacheForTesting(): void {
  _processorMdx = null
  _processorNoMdx = null
}

// ─── Markdown → Pyreon TSX pipeline ────────────────────────────────────────
//
// One-shot transformer used by the Vite plugin's `transform` hook.
//
// Pipeline:
//   1. gray-matter splits frontmatter (YAML) from the body
//   2. unified + remark-parse + remark-frontmatter parses body → mdast
//   3. emitJsx walks the mdast → Pyreon JSX string + heading list
//   4. wrap into a complete .tsx module shape
//
// PR 2 will plug in remark-gfm + remark-shiki + the custom callout/
// codegroup remark plugins. PR 3 adds remark-mdx for JSX-in-markdown.

export interface CompileResult {
  /** The full `.tsx` module source. */
  code: string
  /** Frontmatter as parsed from YAML. Zod validation happens in PR 4. */
  frontmatter: Record<string, unknown>
  /** Headings list (for the page's `headings` export, drives TOC). */
  headings: Heading[]
  /** Derived slug from the file path. */
  slug: string
  /**
   * Component names referenced in the markdown via JSX. Useful for
   * downstream validation, dependency tracking, HMR invalidation.
   * Empty array when `mdx: false`.
   */
  componentRefs: string[]
  /**
   * Top-of-file ESM `import` / `export` statements collected from
   * `mdxjsEsm` nodes. They are hoisted into the compiled `.tsx`
   * module so per-`.md` imports flow through unchanged.
   */
  hoistedEsm: string[]
  /**
   * Non-fatal compile diagnostics emitted by remark plugins —
   * unknown `:::xxx` directives with a "did you mean...?" hint
   * (PR-A audit H6), and the unclosed-fence heuristic for
   * `:::tip` etc. that swallowed the rest of the file (PR-A audit
   * C9). The Vite plugin pipes each through `this.warn(...)` so
   * the author sees a clickable file location.
   */
  warnings: string[]
}

export interface CompileOptions {
  /**
   * Disable Shiki code highlighting. Useful for tests + situations
   * where highlighting would be redundant (e.g. previewing raw
   * markdown). Default: enabled.
   */
  highlight?: boolean
  /** Shiki theme + language config. */
  highlighter?: HighlighterOptions
  /**
   * Enable MDX parsing (JSX-in-markdown + ESM imports). Default:
   * `true` when the file id ends with `.mdx`; auto-detected from id.
   * Set explicitly to `false` for `.md` files that include JSX-looking
   * content that should NOT be parsed as JSX (very rare).
   *
   * Both `.md` and `.mdx` files pass through the same pipeline, but
   * remark-mdx is plugged in only when `mdx` is true. `.md` files
   * still allow JSX tags by default — the cost is one extra remark
   * plugin pass; we prefer enabling MDX for all files so users don't
   * have to rename to use a component.
   */
  mdx?: boolean
  /**
   * Module specifier for the generated `import { ... }` line that
   * brings in user-side MDX components referenced inline. Defaults to
   * `'virtual:zero-content/components'` — the Vite plugin serves that
   * virtual module by scanning `src/mdx/`. Custom values are useful
   * for tests + non-Vite consumers.
   */
  componentsModule?: string
  /**
   * Resolve a markdown link's `href` to a route URL. Used by the
   * emit-jsx layer to rewrite `[foo](./bar.md)` → `/<collection>/<slug>`
   * (PR-F audit H8). Return `null` to leave the link unchanged.
   */
  resolveInternalLink?: (href: string) => string | null
  /**
   * Resolve a markdown image's `src` to a TSX expression spliced into
   * `<Image src={...}>`. The default plugin resolver returns
   * `import('./hero.png?optimize')` for `./` / `../` paths; absolute
   * URLs and data URIs return `null` and fall through to `<img>`
   * (PR-F audit H7).
   */
  resolveLocalImage?: (src: string) => string | null
}

/**
 * Compile a markdown source string + file id into a Pyreon `.tsx`
 * module. The `id` is the absolute file path Vite passes to
 * `transform`; we use it to derive a stable slug.
 */
export async function compileMarkdown(
  source: string,
  id: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  // 1. Split frontmatter (uses gray-matter directly — remark-frontmatter
  //    keeps the YAML in the mdast tree but doesn't parse it; gray-matter
  //    parses it as JS values).
  const parsed = matter(source)
  const body = parsed.content
  const frontmatter = parsed.data as Record<string, unknown>

  // 2. Build the unified pipeline. Order matters:
  //      parse → frontmatter → gfm → directive → callout → codegroup → (mdx)
  //    `parse` produces mdast; the rest are transformers that walk it.
  //    remark-mdx is added last (after the directive-based callout +
  //    codegroup plugins) so its tokenizer doesn't conflict with the
  //    `:::` directive syntax.
  const mdxEnabled = options.mdx ?? defaultMdxEnabled(id)
  // Collector for non-fatal callout diagnostics — unknown name typos,
  // forgotten-`:::`-close heuristic. The remark plugin pushes onto
  // this; we return it on the CompileResult so the Vite plugin can
  // surface each through `this.warn(...)` with file context.
  const compileWarnings: string[] = []
  // PR-G audit H12 — reuse the cached processor instead of rebuilding
  // it per file. The callout plugin's per-file `{ source, warnings }`
  // ride along through a module-level thread-local read by the
  // `remarkCalloutThreadLocal` wrapper; safe because JS is
  // single-threaded and we never `await` between the assignment and
  // the synchronous `processor.parse`.
  _currentCalloutContext = { source: body, warnings: compileWarnings }
  let raw: Root
  let tree: Root
  try {
    const processor = getProcessor(mdxEnabled)
    // VitePress / Starlight / Docusaurus directive syntax tolerates
    // `::: name` (one or more spaces between the fence and the
    // directive name); remark-directive only accepts `:::name`.
    // Pyreon docs authored before the cutover used the space-form,
    // and downstream consumers may still author in it. We normalize
    // before parsing — strip the space(s) so remark sees the canonical
    // form and the callout / codegroup / details plugins can fire.
    // Without this, `::: code-group` rendered as literal paragraph
    // text in every page that used it.
    //
    // The regex is anchored at line start (`m` flag), allows leading
    // whitespace, requires `:::` followed by at least one space and
    // a valid identifier (lowercase letter then alphanum/dash). The
    // identifier rule is conservative so we don't accidentally
    // rewrite a code line that happens to start with `::: ` in prose.
    const normalized = body.replace(
      /^(\s*):::\s+([a-z][a-z0-9-]*)/gm,
      '$1:::$2',
    )
    raw = processor.parse(normalized) as Root
    // `parse` (sync) → `run` (async; lets remark plugins return promises
    // for future Shiki-as-remark-plugin moves). Currently all our plugins
    // are sync so the await is cheap. The thread-local read in
    // `remarkCalloutThreadLocal` happens before the await, so clearing
    // it after `run()` resolves is safe.
    tree = (await processor.run(raw)) as Root
  } finally {
    _currentCalloutContext = null
  }

  // 3. Build emit options. Highlight callback for Shiki + MDX hoist
  //    collectors so we can prepend ESM imports + component-imports to
  //    the compiled `.tsx`.
  const componentRefs = new Set<string>()
  const hoistedEsm: string[] = []
  const emitOpts: EmitOptions = {
    mdxEsmHoist: (esm) => hoistedEsm.push(esm),
    mdxComponentRef: (name) => componentRefs.add(name),
    // PR-H audit M16 — surface unhandled mdast nodes as visible
    // compile warnings. Authors using a markdown feature the
    // pipeline doesn't yet emit get a build-time signal instead of
    // silent content drop. Dedupe per (nodeType, file) so a thousand
    // unhandled cells in one table don't flood the log.
    onUnhandledNode: (() => {
      const seen = new Set<string>()
      return (nodeType: string) => {
        if (seen.has(nodeType)) return
        seen.add(nodeType)
        compileWarnings.push(
          `[zero-content] unhandled mdast node "${nodeType}" — content was dropped from the rendered output. Open an issue if this node type should be handled.`,
        )
      }
    })(),
  }
  if (options.highlight !== false) {
    emitOpts.highlight = (code, lang) => highlightCode(code, lang, options.highlighter)
  }
  if (options.resolveInternalLink !== undefined) {
    emitOpts.resolveInternalLink = options.resolveInternalLink
  }
  if (options.resolveLocalImage !== undefined) {
    // Wrap the resolver so that when an image is rewritten, we ALSO
    // register `Image` as a component reference — that auto-imports
    // the built-in re-export through `virtual:zero-content/components`
    // (PR-F audit H7). The user's markdown doesn't need to write
    // `import { Image } from '@pyreon/zero'`.
    const userResolver = options.resolveLocalImage
    emitOpts.resolveLocalImage = (src) => {
      const out = userResolver(src)
      if (out !== null) componentRefs.add('Image')
      return out
    }
  }

  // 4. Walk → JSX string + heading capture.
  const { body: jsxBody, headings } = await emitJsx(tree, emitOpts)

  // 5. Derive a stable slug. The file `id` is the absolute path Vite
  //    passes; pick whatever comes after `/content/` (the documented
  //    convention) or fall back to the filename stem.
  const slug = deriveSlug(id)

  // 6. Wrap into a complete TSX module. The module exports:
  //      - `default` — the page component
  //      - `frontmatter` — parsed YAML, typed by zod at PR 4
  //      - `headings` — for the TOC
  //      - `slug` — for the catch-all route
  //
  //    Hoisted ESM (per-`.md` imports + exports) lands at the top of
  //    the module. A single `import { Name1, Name2 } from componentsModule`
  //    is emitted when any uppercase JSX tag was referenced AND those
  //    names aren't already imported via hoisted ESM.
  const componentRefList = Array.from(componentRefs).sort()
  const code = renderTsxModule({
    body: jsxBody,
    frontmatter,
    headings,
    slug,
    hoistedEsm,
    componentRefs: componentRefList,
    componentsModule:
      options.componentsModule ?? 'virtual:zero-content/components',
  })

  return {
    code,
    frontmatter,
    headings,
    slug,
    componentRefs: componentRefList,
    hoistedEsm: [...hoistedEsm],
    warnings: compileWarnings,
  }
}

/**
 * MDX is enabled by default. Auto-detection: any `.mdx` extension forces
 * it; otherwise it stays enabled so `.md` files can use components
 * inline. Consumers explicitly setting `mdx: false` opt out.
 *
 * @internal exported for testing
 */
export function defaultMdxEnabled(id: string): boolean {
  // Auto-on for both .md and .mdx. The cost of enabling remark-mdx for
  // markdown that contains no JSX is negligible (one extra plugin
  // pass).
  void id
  return true
}

function renderTsxModule(opts: {
  body: string
  frontmatter: Record<string, unknown>
  headings: Heading[]
  slug: string
  hoistedEsm: string[]
  componentRefs: string[]
  componentsModule: string
}): string {
  const fm = JSON.stringify(opts.frontmatter, null, 2)
  const hd = JSON.stringify(opts.headings, null, 2)
  const sg = JSON.stringify(opts.slug)

  // Hoisted ESM goes first — these are the user's per-`.md` `import`
  // statements (and any `export const x = ...`). They land at module
  // scope so referenced bindings are visible inside the rendered body.
  const hoistedSection = opts.hoistedEsm.length > 0
    ? opts.hoistedEsm.join('\n') + '\n'
    : ''

  // Auto-import any components referenced in the markdown body that
  // weren't already brought in via hoisted ESM. The check is a simple
  // regex match against the hoisted text — over-conservative (false
  // positives on identifiers that appear in strings) but never wrong
  // in a way that breaks the build: dedup falls through to the user's
  // own import in that case.
  const hoistedJoined = opts.hoistedEsm.join('\n')
  const autoImports = opts.componentRefs.filter(
    (name) => !new RegExp(`\\b${escapeForRegex(name)}\\b`).test(hoistedJoined),
  )
  // PR-G audit C3 — emit ONE import per referenced component, each
  // from `virtual:zero-content/components/<Name>` (per-component
  // sub-module) instead of the barrel. The barrel previously meant a
  // touch to ANY `src/mdx/` file invalidated EVERY `.md` page; with
  // per-component sub-modules, only pages that imported the changed
  // component invalidate. The sub-module is a thin re-export of the
  // barrel's named binding (so identity / dedup is preserved). Custom
  // `componentsModule` opt-in is preserved by treating it as the base
  // path (`<custom>/<Name>`) when it isn't the default barrel id.
  const useBarrelDirectly = opts.componentsModule
    .startsWith('virtual:zero-content/components')
    ? false
    : true
  const autoImportLine =
    autoImports.length > 0
      ? useBarrelDirectly
        ? `import { ${autoImports.join(', ')} } from ${JSON.stringify(opts.componentsModule)}\n`
        : autoImports
            .map(
              (name) =>
                `import { ${name} } from ${JSON.stringify(opts.componentsModule.replace(/\/$/, '') + '/' + name)}`,
            )
            .join('\n') + '\n'
      : ''

  return `// Generated by @pyreon/zero-content. Do not edit.
${autoImportLine}${hoistedSection}export const frontmatter = ${fm}
export const headings = ${hd}
export const slug = ${sg}

export default function ContentPage() {
  return (
    <article class="content">
${indent(opts.body, '      ')}
    </article>
  )
}
`
}

/** Escape a string for inclusion in a regular expression character class. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Derive a slug from an absolute file path. Strips the leading path
 * up to and including a `/content/` segment when present; falls back
 * to the basename. Strips the `.md` / `.mdx` extension.
 *
 * Examples:
 *   /abs/project/src/content/docs/zero.md  → docs/zero
 *   /abs/project/src/content/index.md       → index
 *   /abs/project/random.md                   → random
 *
 * Implemented with string ops rather than a `/[/]content[/](.+?)\\.(md|mdx)$/i`
 * regex so adversarial paths with many `/content/` segments can't trigger
 * polynomial backtracking (ReDoS). All work is O(n) length walks.
 *
 * @internal exported for testing
 */
export function deriveSlug(absPath: string): string {
  const normalized = absPath.split('\\').join('/')
  const stripped = stripMdExtension(normalized)
  if (stripped === null) {
    // No `.md` / `.mdx` extension — fall back to the basename verbatim.
    return basename(normalized)
  }
  // Look for the FIRST `/content/` segment (case-insensitive) and trim
  // everything up to + including it. `lastIndexOf` would be safer against
  // accidental `/content/` in user directories, but the convention is
  // `src/content/...` so the first match is correct.
  const lower = stripped.toLowerCase()
  const marker = '/content/'
  const idx = lower.indexOf(marker)
  // `slugFromPath` does the index-collapse + extension-strip + leading-
  // slash normalisation. We've already stripped the extension here
  // (re-doing it inside slugFromPath is a no-op — the `MD_EXT_RE`
  // matcher is exhaustive), so we pass the post-`/content/` remainder
  // straight through. Single source of truth shared with the runtime
  // `__zcSlug` emitted by `virtual-collections.ts`.
  if (idx >= 0) return slugFromPath(stripped.slice(idx + marker.length))
  return basename(stripped)
}

/** Last path segment of `/foo/bar` → `bar`. Empty input → empty. */
function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

/**
 * Strip a `.md` / `.mdx` suffix (case-insensitive). Returns the path
 * without the extension when one matched; `null` when no match.
 */
function stripMdExtension(path: string): string | null {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx < 0) return null
  const ext = path.slice(dotIdx + 1).toLowerCase()
  if (ext === 'md' || ext === 'mdx') return path.slice(0, dotIdx)
  return null
}

/**
 * Indent every line of `text` by `prefix`. Used to pretty-print JSX
 * inside the wrapping `<article>`.
 */
function indent(text: string, prefix: string): string {
  if (!text) return ''
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : prefix + line))
    .join('\n')
}
