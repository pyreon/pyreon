import matter from 'gray-matter'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { Root } from 'mdast'
import { emitJsx, type EmitOptions } from './emit-jsx'
import { remarkCallout } from './remark-plugins/callout'
import { remarkCodeGroup } from './remark-plugins/codegroup'
import { highlightCode, type HighlighterOptions } from './highlighter'
import { slugFromPath } from '../_shared/derive-slug'
import type { Heading } from '../types'

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
  const base = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkCallout, { source: body, warnings: compileWarnings })
    .use(remarkCodeGroup)
  // remark-mdx widens the processor's transformer types (it transforms
  // the tree from `Root` to `Root` while introducing mdx* nodes). Cast
  // through `unknown` to keep the union narrow at the `processor.parse`
  // call site.
  const processor = mdxEnabled
    ? (base.use(remarkMdx) as unknown as typeof base)
    : base

  // `parse` (sync) → `run` (async; lets remark plugins return promises
  // for future Shiki-as-remark-plugin moves). Currently all our plugins
  // are sync so the await is cheap.
  const raw = processor.parse(body) as Root
  const tree = (await processor.run(raw)) as Root

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
  const autoImportLine =
    autoImports.length > 0
      ? `import { ${autoImports.join(', ')} } from ${JSON.stringify(opts.componentsModule)}\n`
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
