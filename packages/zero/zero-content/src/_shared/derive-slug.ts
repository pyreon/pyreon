// ─── Slug derivation — single source of truth ─────────────────────────────
//
// Maps `<base>/<path>.<md|mdx>` → URL slug. Used in TWO places that
// previously carried independent implementations:
//
//   1. `pipeline/parse.ts:deriveSlug(absPath)` — the build-time slug
//      baked into the compiled `.tsx` module's `export const slug = …`.
//   2. `virtual-collections.ts:__zcSlug(file, base)` — the runtime slug
//      computed from `import.meta.glob` keys when populating the
//      `_setRegistry({...})` map at app boot.
//
// Pre-fix (PR-A audit L11) the two diverged subtly:
//   - `deriveSlug` looked for the FIRST `/content/` segment (case-
//     insensitive) and stripped everything up to + including it.
//   - `__zcSlug` stripped a caller-supplied `base` prefix verbatim.
//
// For the canonical `src/content/<collection>/<path>.md` shape they
// produced the same result, but with custom `path:` overrides or
// nested-`content` folder names they could disagree silently — the
// runtime registry would key on a slug the compiled module's
// `export const slug` didn't match. Routing then 404s on a page that
// exists in `dist/`. Hard to debug, easy to recur.
//
// Shape: `slugFromPath(rel)` takes a path RELATIVE to the collection
// base (no extension stripping done yet — accepts `.md`/`.mdx`) and
// returns the URL slug. Both consumers reduce to this:
//   - parse.ts strips the `<root>/<base>/` prefix from its absolute
//     path then passes the remainder here.
//   - virtual-collections's emitted runtime helper does the same on
//     the `import.meta.glob` key.

const MD_EXT_RE = /\.(md|mdx)$/i

/**
 * Compute the URL slug for a file path that's RELATIVE to a collection's
 * `path:` (`base`). Strips the `.md`/`.mdx` extension, normalises Windows
 * separators, and collapses a trailing `/index` (or bare `index`) to
 * the parent directory (`/`'s become slug segments). Empty input AND
 * `index` both yield `''` so the bare collection root resolves to
 * `/<collection>/`.
 *
 * Pure — no fs access, no allocation beyond the two `replace` strings.
 *
 * @internal
 */
export function slugFromPath(rel: string): string {
  // Normalise Windows separators so `\path\to\file.md` works.
  let s = rel.split('\\').join('/')
  // Drop leading `/` if any so `slugFromPath('/foo/bar.md')` is sane.
  if (s.startsWith('/')) s = s.slice(1)
  // Strip extension.
  s = s.replace(MD_EXT_RE, '')
  // Collapse `/index` (any nesting) and bare `index` to the parent dir.
  if (s.endsWith('/index')) s = s.slice(0, -'/index'.length)
  else if (s === 'index') s = ''
  return s
}

/**
 * Source string for the runtime helper emitted by the virtual module.
 * Keeps the runtime-and-build-time implementations BYTE-IDENTICAL —
 * any change to `slugFromPath` is mirrored here automatically.
 *
 * The emitted function is a closed-over verbatim copy of `slugFromPath`
 * + a `strip-base` step (subtract the per-collection absolute base
 * from `import.meta.glob`'s key before deriving the slug). We can't
 * `import` from `@pyreon/zero-content` here because the virtual module
 * exists in the CONSUMER's module graph (its `_setRegistry` call IS
 * the bootstrapping wire); inlining the body is the bulletproof way
 * to keep the two paths in sync.
 *
 * @internal
 */
export function emitRuntimeSlugHelper(): string {
  return `function __zcSlug(file, base) {
  // ── kept in lock-step with slugFromPath in @pyreon/zero-content's
  //    _shared/derive-slug.ts. Edit there, run \`bun run gen-docs\`
  //    (and re-run tests) before publishing.
  let rel = file.startsWith(base) ? file.slice(base.length) : file
  let s = rel.split('\\\\').join('/')
  if (s.startsWith('/')) s = s.slice(1)
  s = s.replace(/\\.(md|mdx)$/i, '')
  if (s.endsWith('/index')) s = s.slice(0, -'/index'.length)
  else if (s === 'index') s = ''
  return s
}`
}
