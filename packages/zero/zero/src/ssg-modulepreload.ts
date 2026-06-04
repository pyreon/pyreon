/**
 * Per-route `<link rel="modulepreload">` for SSG — islands-safe.
 *
 * Vite already emits modulepreload for the single ENTRY's static import graph
 * in the built `index.html`, and the SSG pipeline preserves those links. What's
 * missing is the per-route delta: a route's own component chunk (lazy-imported,
 * so discovered LATE in the network waterfall) and that chunk's STATIC import
 * closure. Pre-declaring them in the route's `<head>` lets the browser fetch
 * the whole route graph in parallel from t=0 instead of one chunk at a time.
 *
 * **The critical correctness rule: STATIC imports only, NEVER `dynamicImports`.**
 * A route's `dynamicImports` are exactly the chunks the author DEFERRED on
 * purpose — islands (`hydrate: 'never' | 'visible' | …`), `lazy()` components,
 * heavy-module-in-handler. Modulepreloading those pulls deferred code onto the
 * first-paint critical path and defeats the islands model (a net perf
 * regression). Following only the manifest `imports` field structurally
 * excludes them.
 *
 * Every step degrades gracefully: a missing manifest, an unresolved route
 * module, or a malformed entry just yields no preload for that path — a
 * `modulepreload` is a non-load-bearing hint, so the page always still works.
 */

/** A single chunk record in Vite's `build.manifest` output. */
export interface ViteManifestChunk {
  /** The emitted asset path relative to outDir, e.g. `assets/about-Bx2.js`. */
  file: string
  /** The original source key, when present (mirrors the manifest key for source entries). */
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  /** STATIC imports — manifest KEYS (not files). Safe to preload. */
  imports?: string[]
  /** DYNAMIC imports — manifest KEYS. NEVER preload (islands / lazy / deferred). */
  dynamicImports?: string[]
  css?: string[]
}

export type ViteManifest = Record<string, ViteManifestChunk>

const toPosix = (p: string): string => p.replace(/\\/g, '/')

/**
 * Map a route component's source module path (the router record's `_hmrId`,
 * an absolute `${routesDir}/${filePath}`) to its key in the Vite manifest.
 *
 * Primary lookup: `relative(root, hmrId)` in posix form — Vite keys source
 * entries by their root-relative posix path (`src/routes/about.tsx`). Robust
 * fallbacks cover manifest-key-format variance across Vite/Rolldown versions:
 * a `src`-field match, then a longest-suffix match on the route file path.
 *
 * @returns the manifest KEY, or null when no chunk corresponds (→ no preload).
 */
export function resolveManifestKey(
  manifest: ViteManifest,
  hmrId: string,
  root: string,
  relativeFn: (from: string, to: string) => string,
): string | null {
  const rel = toPosix(relativeFn(root, hmrId))
  if (rel && !rel.startsWith('..')) {
    if (manifest[rel]) return rel
    // Some setups key with a leading `./` or a normalized variant.
    const noDot = rel.replace(/^\.\//, '')
    if (manifest[noDot]) return noDot
  }
  // Fallback 1 — a chunk whose `src` field matches the relative path.
  for (const key of Object.keys(manifest)) {
    if (manifest[key]?.src && toPosix(manifest[key]!.src!) === rel) return key
  }
  // Fallback 2 — longest-suffix match on the absolute source path. Guards
  // against key formats that retain more (or less) of the path prefix.
  const absPosix = toPosix(hmrId)
  let best: string | null = null
  for (const key of Object.keys(manifest)) {
    const kPosix = toPosix(key)
    if (absPosix.endsWith('/' + kPosix) && (!best || kPosix.length > best.length)) {
      best = key
    }
  }
  return best
}

/**
 * The closed set of emitted chunk FILES reachable from `entryKeys` via STATIC
 * imports only. `dynamicImports` are deliberately NOT followed — that exclusion
 * is what keeps island / lazy chunks off the critical path.
 */
export function collectStaticChunkClosure(
  manifest: ViteManifest,
  entryKeys: readonly string[],
): Set<string> {
  const files = new Set<string>()
  const visited = new Set<string>()
  const stack = [...entryKeys]
  while (stack.length > 0) {
    const key = stack.pop()!
    if (visited.has(key)) continue
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) continue
    if (chunk.file) files.add(chunk.file)
    // STATIC imports only — NEVER chunk.dynamicImports.
    for (const imp of chunk.imports ?? []) {
      if (!visited.has(imp)) stack.push(imp)
    }
  }
  return files
}

/** Join the deploy base (`/` or `/blog/`) with a manifest file path. */
export function joinBase(base: string, file: string): string {
  const b = base.endsWith('/') ? base : base + '/'
  const f = file.startsWith('/') ? file.slice(1) : file
  return b + f
}

/** Extract the set of `href`s already declared as modulepreload in the template. */
export function parseExistingModulePreloads(templateHtml: string): Set<string> {
  const set = new Set<string>()
  const linkRe = /<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi
  const matches = templateHtml.match(linkRe)
  if (!matches) return set
  for (const tag of matches) {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)
    if (href?.[1]) set.add(href[1])
  }
  return set
}

/**
 * Compute the per-route modulepreload hrefs for a rendered path: the static
 * chunk closure of every matched route module, base-prefixed, minus the hrefs
 * the template's entry graph already preloads (the browser would dedup, but
 * not re-emitting keeps the head lean). Deterministically sorted.
 */
export function computeRoutePreloadHrefs(args: {
  manifest: ViteManifest
  routeModules: readonly string[]
  root: string
  base: string
  alreadyPreloaded: ReadonlySet<string>
  relativeFn: (from: string, to: string) => string
}): string[] {
  const { manifest, routeModules, root, base, alreadyPreloaded, relativeFn } = args
  const keys: string[] = []
  for (const mod of routeModules) {
    const key = resolveManifestKey(manifest, mod, root, relativeFn)
    if (key) keys.push(key)
  }
  if (keys.length === 0) return []
  const files = collectStaticChunkClosure(manifest, keys)
  const hrefs: string[] = []
  for (const file of files) {
    const href = joinBase(base, file)
    if (!alreadyPreloaded.has(href)) hrefs.push(href)
  }
  return hrefs.sort()
}

/**
 * The set of hrefs the ENTRY chunk's static graph already loads. Per-route
 * preloads subtract this so they emit only the route's *delta* — not the entry
 * + shared chunks the template's `<script type=module>` + Vite's own
 * modulepreloads already cover. (Real manifests list `index.html` — the entry
 * key — inside each route's `imports`, so without this subtraction every route
 * would re-declare the whole entry graph.)
 */
export function computeEntryHrefs(manifest: ViteManifest, base: string): Set<string> {
  const entryKey = Object.keys(manifest).find((k) => manifest[k]?.isEntry)
  if (!entryKey) return new Set()
  const files = collectStaticChunkClosure(manifest, [entryKey])
  return new Set([...files].map((f) => joinBase(base, f)))
}

/** Render `<link rel="modulepreload" … crossorigin>` tags for the hrefs. */
export function renderModulePreloadLinks(hrefs: readonly string[]): string {
  return hrefs
    .map((href) => `<link rel="modulepreload" href="${href}" crossorigin>`)
    .join('\n')
}
