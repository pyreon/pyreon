// Auto-computed size-adjusted fallback fonts (CLS elimination during the
// font swap) — the Next.js `next/font` technique, built on @capsizecss.
//
// Why: a Google Font (Ubuntu) has different x-height / cap-height /
// ascent / descent / line-gap than the system fallback the browser shows
// while it loads. When the real font arrives, layout SHIFTS. The fix is a
// paired `@font-face` for "<Family> Fallback" that renders the system
// font (Arial) with `size-adjust` + `ascent/descent/line-gap-override`
// computed so its metrics MATCH the web font — the swap then moves
// nothing. capsize's `createFontStack` produces the exact override math
// next/font uses.
//
// Ground-truth metrics: we unpack the ACTUAL woff2 `@pyreon/zero/font`
// already downloads (self-host), so the overrides reflect the bytes the
// app ships — never a stale precomputed table. In CDN mode (no download)
// we fall back to capsize's precomputed metrics by family name.
//
// All capsize imports are DYNAMIC + build-time only (this module is
// reached solely from the fontPlugin's `buildStart`), so they never enter
// a client bundle.

/** The capsize metrics shape we consume (structural — avoids a type-dep). */
export interface FontMetrics {
  familyName: string
  category?: string
  ascent: number
  descent: number
  lineGap: number
  unitsPerEm: number
  xWidthAvg: number
}

/** One family's computed fallback: the @font-face CSS + the full stack. */
export interface AutoFallback {
  /** Original family, e.g. "Ubuntu" / "JetBrains Mono". */
  family: string
  /** URL/var-safe slug, e.g. "ubuntu" / "jetbrains-mono". */
  slug: string
  /** `@font-face { font-family: "Ubuntu Fallback"; … }` (capsize output). */
  fontFaces: string
  /** Full stack, e.g. `Ubuntu, "Ubuntu Fallback", Arial`. */
  fontFamily: string
}

/**
 * Slugify a family name for a CSS custom property:
 * "JetBrains Mono" → "jetbrains-mono". Pure.
 */
export function slugifyFamily(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Default system fallback for a font, by capsize `category` when known
 * (serif → "Times New Roman", monospace → "Courier New", else "Arial").
 * Google's css2 doesn't expose category, but capsize metrics carry it; in
 * CDN mode without it we default to Arial (the dominant sans case).
 */
export function defaultSystemFallback(category?: string): string {
  if (category === 'serif') return 'Times New Roman'
  if (category === 'monospace') return 'Courier New'
  return 'Arial'
}

// capsize maps a system-font name to its metrics module slug.
const SYSTEM_FALLBACK_SLUGS: Record<string, string> = {
  arial: 'arial',
  'times new roman': 'timesNewRoman',
  'courier new': 'courierNew',
  georgia: 'georgia',
  helvetica: 'helvetica',
  verdana: 'verdana',
  tahoma: 'tahoma',
  'trebuchet ms': 'trebuchetMs',
}

/** Resolve a system fallback font's precomputed metrics (capsize). null if unknown. */
export async function systemFallbackMetrics(name: string): Promise<FontMetrics | null> {
  const slug = SYSTEM_FALLBACK_SLUGS[name.trim().toLowerCase()]
  if (!slug) return null
  try {
    const mod = await import(`@capsizecss/metrics/${slug}`)
    return (mod.default ?? mod) as FontMetrics
  } catch {
    return null
  }
}

/** Unpack metrics from an actual font buffer (ground truth). null on parse failure. */
export async function unpackMetrics(buffer: Uint8Array): Promise<FontMetrics | null> {
  try {
    const { fromBlob } = await import('@capsizecss/unpack')
    // fromBlob is the build-time path; it handles woff2 decompression.
    const m = (await fromBlob(new Blob([buffer as BlobPart]))) as FontMetrics
    return isCompleteMetrics(m) ? m : null
  } catch {
    return null
  }
}

/**
 * A metrics object is usable only if it carries EVERY field
 * `createFontStack` reads to compute the overrides — `familyName` +
 * `unitsPerEm` + `ascent` + `descent` + `lineGap` + `xWidthAvg`. A corrupt
 * or partial font (unpack returning gaps) is rejected here so we never
 * feed an incomplete object into the override math (which would yield
 * NaN%/Infinity% overrides). Exported for the tests + reused by every
 * metrics-producing path (buffer unpack AND precomputed lookup).
 */
export function isCompleteMetrics(m: unknown): m is FontMetrics {
  if (!m || typeof m !== 'object') return false
  const x = m as Record<string, unknown>
  return (
    typeof x.familyName === 'string' &&
    x.familyName.length > 0 &&
    typeof x.unitsPerEm === 'number' &&
    x.unitsPerEm > 0 &&
    typeof x.ascent === 'number' &&
    typeof x.descent === 'number' &&
    typeof x.lineGap === 'number' &&
    typeof x.xWidthAvg === 'number'
  )
}

/** Look a family up in capsize's precomputed collection (CDN-mode fallback). null if absent. */
export async function precomputedMetrics(family: string): Promise<FontMetrics | null> {
  try {
    const { entireMetricsCollection } = await import('@capsizecss/metrics/entireMetricsCollection')
    const key = slugifyFamily(family).replace(/-/g, '') // capsize keys are camel/condensed
    const collection = entireMetricsCollection as unknown as Record<string, FontMetrics>
    // Try exact familyName match first, then a normalized key match.
    for (const v of Object.values(collection)) {
      if (v.familyName?.toLowerCase() === family.trim().toLowerCase()) {
        return isCompleteMetrics(v) ? v : null
      }
    }
    const camel = slugifyFamily(family).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    const direct = collection[key] ?? collection[camel]
    return isCompleteMetrics(direct) ? direct : null
  } catch {
    return null
  }
}

/**
 * Build the fallback @font-face + family stack for one web font, given
 * its metrics + a chosen system fallback. Wraps capsize `createFontStack`
 * (the exact next/font override math). Returns null if the system
 * fallback metrics can't be resolved. Async only because capsize is
 * dynamically imported; otherwise pure + deterministic.
 */
export async function buildFallbackCss(
  webMetrics: FontMetrics,
  systemFallbackName: string,
): Promise<AutoFallback | null> {
  const fallback = await systemFallbackMetrics(systemFallbackName)
  if (!fallback) return null
  const { createFontStack } = await import('@capsizecss/core')
  const { fontFamily, fontFaces } = createFontStack([webMetrics, fallback])
  return {
    family: webMetrics.familyName,
    slug: slugifyFamily(webMetrics.familyName),
    fontFaces,
    fontFamily,
  }
}

/**
 * Orchestrate auto-fallback computation for a build.
 *
 * - Self-host (buffers present): unpack each woff2 for GROUND-TRUTH
 *   metrics, group by the font's own familyName (capsize reads it), one
 *   per family.
 * - CDN (no buffers): look each configured family up in capsize's
 *   precomputed collection.
 *
 * `skipFamilies` (lowercased) are families the user already configured a
 * MANUAL `fallbacks` entry for — explicit wins, auto skips them.
 * `fallbackNames` lets the user pick the system fallback per family.
 * Any family whose metrics or system-fallback can't be resolved is
 * skipped with a dev warning — never a build failure.
 */
export async function computeAutoFallbacks(opts: {
  families: string[]
  fontBuffers?: Uint8Array[]
  skipFamilies?: Set<string>
  fallbackNames?: Record<string, string>
  warn?: (msg: string) => void
}): Promise<AutoFallback[]> {
  const skip = opts.skipFamilies ?? new Set<string>()
  const warn = opts.warn ?? (() => {})
  const out: AutoFallback[] = []
  const seen = new Set<string>()

  // Build a familyName → metrics map from the downloaded buffers.
  const byFamily = new Map<string, FontMetrics>()
  for (const buf of opts.fontBuffers ?? []) {
    const m = await unpackMetrics(buf)
    if (m && !byFamily.has(m.familyName.toLowerCase())) {
      byFamily.set(m.familyName.toLowerCase(), m)
    }
  }

  for (const family of opts.families) {
    const lc = family.trim().toLowerCase()
    if (skip.has(lc) || seen.has(lc)) continue
    seen.add(lc)

    const metrics = byFamily.get(lc) ?? (await precomputedMetrics(family))
    if (!metrics) {
      warn(
        `[Pyreon] fallbackAdjust: no metrics for "${family}" (not in the downloaded fonts or capsize's table) — skipping its CLS fallback.`,
      )
      continue
    }
    const fallbackName = opts.fallbackNames?.[family] ?? defaultSystemFallback(metrics.category)
    const result = await buildFallbackCss(metrics, fallbackName)
    if (!result) {
      warn(
        `[Pyreon] fallbackAdjust: unknown system fallback "${fallbackName}" for "${family}" — skipping. Use Arial / Times New Roman / Courier New / Georgia / Helvetica / Verdana / Tahoma / Trebuchet MS.`,
      )
      continue
    }
    out.push(result)
  }
  return out
}

/**
 * Emit the `:root` CSS variables that put the fallback family INTO the
 * cascade — the load-bearing half: an app using `font-family:
 * var(--pyreon-font-ubuntu)` gets `Ubuntu, "Ubuntu Fallback", Arial`, so
 * the size-adjusted fallback is actually used until Ubuntu loads (without
 * this, the computed @font-face is inert — nothing references it).
 */
export function renderFontFamilyVars(fallbacks: AutoFallback[]): string {
  if (fallbacks.length === 0) return ''
  const vars = fallbacks.map((f) => `  --pyreon-font-${f.slug}: ${f.fontFamily};`).join('\n')
  return `:root {\n${vars}\n}`
}

/** Concatenate every family's fallback @font-face blocks. */
export function renderAutoFallbackFaces(fallbacks: AutoFallback[]): string {
  return fallbacks.map((f) => f.fontFaces).join('\n\n')
}
