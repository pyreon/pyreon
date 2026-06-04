import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'

// ─── Font optimization ──────────────────────────────────────────────────────
//
// Zero provides automatic font optimization:
// - Downloads and self-hosts Google Fonts at build time (privacy + performance)
// - Falls back to CDN link in dev mode (for fast dev startup)
// - Injects preconnect/preload hints into the HTML
// - Sets font-display: swap to prevent FOIT (Flash of Invisible Text)
// - Generates optimized @font-face declarations
// - Size-adjusted fallback fonts to reduce CLS

export interface FontConfig {
  /**
   * Google Fonts families.
   *
   * Accepts both string shorthand and structured objects:
   * - String: "Inter:wght@400;500;700" or "Inter:wght@100..900"
   * - Object: { family: "Inter", weights: [400, 500, 700] }
   * - Variable: { family: "Inter", variable: true, weightRange: [100, 900] }
   */
  google?: GoogleFontInput[]
  /** Local font files. */
  local?: LocalFont[]
  /** Default font-display strategy. Default: "swap" */
  display?: FontDisplay
  /** Preload critical fonts. Default: true */
  preload?: boolean
  /** Self-host Google Fonts at build time. Default: true */
  selfHost?: boolean
  /**
   * Restrict self-hosted Google Font subsets to this allowlist, e.g.
   * `['latin', 'latin-ext']`. Google's css2 API returns EVERY subset a
   * family supports (latin, latin-ext, cyrillic, cyrillic-ext, greek,
   * vietnamese, …) — each a separate `@font-face` with its own
   * `unicode-range` — and it IGNORES a `&subset=` URL param, so the only
   * way to drop the unused ones is to filter the returned CSS by the
   * per-subset comment labels Google emits before each block (which this
   * does).
   *
   * Self-host only — no effect with `selfHost: false` or in dev. The
   * browser already skips unrequested subsets at runtime via
   * `unicode-range`, so this changes NOTHING visible; it only trims the
   * emitted `woff2` files (build output / deploy size), not runtime
   * behavior.
   *
   * Default: `undefined` keeps ALL subsets (no behavior change). An
   * empty array, or an allowlist that matches no subset, also keeps all
   * subsets — a smaller-but-correct build always beats a fontless one.
   */
  subsets?: string[]
  /** Fallback font metrics for reducing CLS. */
  fallbacks?: Record<string, FallbackMetrics>
}

/** Static Google Font config. */
export interface GoogleFontStatic {
  family: string
  weights: number[]
  italic?: boolean
  variable?: false
}

/** Variable Google Font config. */
export interface GoogleFontVariable {
  family: string
  /** Weight range as [min, max] tuple. e.g. [100, 900] */
  weightRange: [number, number]
  italic?: boolean
  variable: true
}

/** Google font input: structured object or string shorthand. */
export type GoogleFontInput = GoogleFontStatic | GoogleFontVariable | string

export interface LocalFont {
  family: string
  src: string
  /** Single weight (400) or variable range ("100 900"). */
  weight?: number | `${number} ${number}`
  style?: 'normal' | 'italic'
  display?: FontDisplay
}

export type FontDisplay = 'auto' | 'block' | 'swap' | 'fallback' | 'optional'

/** Metrics for generating size-adjusted fallback fonts to reduce CLS. */
export interface FallbackMetrics {
  /** The fallback font to adjust. e.g. "Arial", "Georgia" */
  fallback: string
  /** Size adjustment factor. e.g. 1.05 */
  sizeAdjust?: number
  /** Ascent override percentage. e.g. 90 */
  ascentOverride?: number
  /** Descent override percentage. e.g. 22 */
  descentOverride?: number
  /** Line gap override percentage. e.g. 0 */
  lineGapOverride?: number
}

interface ResolvedFontBase {
  family: string
  italic: boolean
}

interface StaticFont extends ResolvedFontBase {
  variable: false
  weights: number[]
}

interface VariableFont extends ResolvedFontBase {
  variable: true
  weightRange: [number, number]
}

type ResolvedFont = StaticFont | VariableFont

/**
 * Normalize a GoogleFontInput (string or object) into a ResolvedFont.
 */
export function resolveGoogleFont(input: GoogleFontInput): ResolvedFont {
  if (typeof input === 'string') {
    return parseGoogleFamily(input)
  }

  if (input.variable) {
    return {
      family: input.family,
      italic: input.italic ?? false,
      variable: true,
      weightRange: input.weightRange,
    }
  }

  return {
    family: input.family,
    italic: input.italic ?? false,
    variable: false,
    weights: input.weights,
  }
}

/**
 * Parse Google Fonts family string shorthand.
 *
 * Static weights: "Inter:wght@400;500;700"
 * Variable range:  "Inter:wght@100..900"
 * Variable with italic: "Inter:ital,wght@100..900"
 */
export function parseGoogleFamily(input: string): ResolvedFont {
  const parts = input.split(':')
  const family = (parts[0] ?? '').trim()
  const spec = parts[1]
  let italic = false

  if (spec) {
    italic = spec.includes('ital')

    // Variable font range syntax: wght@100..900
    const rangeMatch = spec.match(/wght@(\d+)\.\.(\d+)/)
    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      return {
        family,
        italic,
        variable: true,
        weightRange: [Number(rangeMatch[1]), Number(rangeMatch[2])],
      }
    }

    // Static weights — two formats:
    // Simple:  "wght@400;500;700"
    // Tuples:  "ital,wght@0,300;0,500;1,300;1,500" (ital_flag,weight pairs)
    const afterAt = spec.split('@')[1]
    if (afterAt) {
      const entries = afterAt.split(';').filter(Boolean)
      const weights = new Set<number>()

      for (const entry of entries) {
        if (entry.includes(',')) {
          // Tuple format: "0,300" or "1,500" — last value is the weight
          const tuple = entry.split(',')
          const weight = Number(tuple[tuple.length - 1])
          if (weight > 0) weights.add(weight)
          // Detect italic from tuple: "1,xxx" means italic
          if (tuple[0] === '1') italic = true
        } else if (entry.includes('..')) {
          // Variable range already handled above — skip
        } else {
          // Simple weight: "400"
          const weight = Number(entry)
          if (weight > 0) weights.add(weight)
        }
      }

      if (weights.size > 0) {
        return {
          family,
          italic,
          variable: false,
          weights: [...weights].sort((a, b) => a - b),
        }
      }
    }
  }

  return { family, italic, variable: false, weights: [400] }
}

/**
 * Generate a Google Fonts CSS URL.
 */
export function googleFontsUrl(families: ResolvedFont[], display: FontDisplay = 'swap'): string {
  const params = families
    .map((f) => {
      const axes = f.italic ? 'ital,wght' : 'wght'
      const name = f.family.replace(/ /g, '+')

      if (f.variable) {
        const range = `${f.weightRange[0]}..${f.weightRange[1]}`
        const value = f.italic ? `0,${range};1,${range}` : range
        return `family=${name}:${axes}@${value}`
      }

      const values = f.weights.map((w) => (f.italic ? `0,${w};1,${w}` : String(w))).join(';')
      return `family=${name}:${axes}@${values}`
    })
    .join('&')

  return `https://fonts.googleapis.com/css2?${params}&display=${display}`
}

/**
 * Generate @font-face CSS for local fonts.
 */
function localFontFaces(fonts: LocalFont[], display: FontDisplay): string {
  return fonts
    .map(
      (f) => `@font-face {
  font-family: "${f.family}";
  src: url("${f.src}");
  font-weight: ${f.weight ?? '400'};
  font-style: ${f.style ?? 'normal'};
  font-display: ${f.display ?? display};
}`,
    )
    .join('\n\n')
}

/**
 * Generate size-adjusted fallback @font-face declarations to reduce CLS.
 */
function fallbackFontFaces(fallbacks: Record<string, FallbackMetrics>): string {
  return Object.entries(fallbacks)
    .map(([family, metrics]) => {
      const overrides: string[] = []
      if (metrics.sizeAdjust != null) overrides.push(`  size-adjust: ${metrics.sizeAdjust * 100}%;`)
      if (metrics.ascentOverride != null)
        overrides.push(`  ascent-override: ${metrics.ascentOverride}%;`)
      if (metrics.descentOverride != null)
        overrides.push(`  descent-override: ${metrics.descentOverride}%;`)
      if (metrics.lineGapOverride != null)
        overrides.push(`  line-gap-override: ${metrics.lineGapOverride}%;`)

      return `@font-face {
  font-family: "${family} Fallback";
  src: local("${metrics.fallback}");
${overrides.join('\n')}
}`
    })
    .join('\n\n')
}

/**
 * Generate preload link tags for critical font files.
 */
function preloadTags(fonts: LocalFont[]): string {
  return fonts
    .map((f) => {
      const ext = f.src.split('.').pop()
      const type =
        ext === 'woff2'
          ? 'font/woff2'
          : ext === 'woff'
            ? 'font/woff'
            : ext === 'ttf'
              ? 'font/ttf'
              : 'font/otf'
      return `<link rel="preload" href="${f.src}" as="font" type="${type}" crossorigin>`
    })
    .join('\n')
}

/**
 * Download Google Fonts CSS with woff2 user agent.
 */
async function downloadGoogleFontsCSS(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })
  if (!response.ok) {
    throw new Error(`[Pyreon] Failed to fetch Google Fonts CSS: ${response.status}`)
  }
  return response.text()
}

/**
 * Download a font file.
 */
async function downloadFontFile(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`[Pyreon] Failed to download font: ${url}`)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Extract font file URLs from Google Fonts CSS.
 */
function extractFontUrls(css: string): string[] {
  const urls: string[] = []
  const regex = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g
  for (const match of css.matchAll(regex)) {
    if (match[1]) urls.push(match[1])
  }
  return urls
}

/**
 * Filter a Google Fonts css2 response down to an allowlist of subsets.
 *
 * css2 emits each subset as a comment label (`latin`, `cyrillic`, …)
 * immediately followed by its `@font-face` block, which carries that
 * subset's own `unicode-range` and its own gstatic `woff2` URL. css2
 * IGNORES a `&subset=` URL param, so post-filtering the returned CSS by
 * these labels is the only way to drop unwanted subsets before they're
 * downloaded + self-hosted.
 *
 * Fail-safe by design — returns the ORIGINAL css unchanged when either
 * (a) it has no recognizable labeled blocks (format drift / a future
 * css2 shape), or (b) the allowlist matches no subset (e.g. a typo).
 * A smaller-but-correct build always beats a fontless one.
 *
 * @example
 * filterCssBySubsets(css, ['latin', 'latin-ext'])
 */
export function filterCssBySubsets(css: string, allowed: string[]): string {
  const allow = new Set(allowed)
  if (allow.size === 0) return css

  const blocks = splitSubsetBlocks(css)
  if (blocks.length === 0) return css

  const kept = blocks.filter((b) => allow.has(b.subset)).map((b) => b.text)
  if (kept.length === 0) return css

  return `${kept.join('').trimEnd()}\n`
}

/**
 * Split a css2 response into its per-subset blocks, in order — each block is
 * led by a comment label (`latin`, `cyrillic`, …) and runs to the next label
 * (or EOF).
 *
 * Deliberately a label-INDEX scan, NOT a single lazy-body-plus-look-ahead
 * regex: that form is flagged as polynomial (ReDoS) by static analysis on
 * adversarial input with many repeated comment delimiters, and the fetched
 * CSS is untrusted. The comment-anchored label match is linear (each
 * delimiter is visited once) and slicing between consecutive label offsets
 * is linear in the input — so the whole pass is O(n) with no backtracking.
 */
function splitSubsetBlocks(css: string): Array<{ subset: string; text: string }> {
  const labelRe = /\/\*\s*([\w-]+)\s*\*\//g
  const marks: Array<{ subset: string; start: number }> = []
  for (const m of css.matchAll(labelRe)) {
    marks.push({ subset: m[1] ?? '', start: m.index ?? 0 })
  }
  return marks.map((mk, i) => ({
    subset: mk.subset,
    text: css.slice(mk.start, marks[i + 1]?.start ?? css.length),
  }))
}

/**
 * Choose the local font URLs to `<link rel=preload>`, preferring the
 * primary subset (the first configured `subsets` entry, else `latin`).
 *
 * Google returns subsets in a fixed order with `cyrillic-ext` FIRST, so the
 * old `slice(0, familyCount)` preloaded the cyrillic-ext file — i.e. it
 * eagerly fetched a subset the page never renders AND failed to preload the
 * latin font that it does. This picks the primary-subset file(s) instead,
 * capped at `limit` to preserve the original preload budget, and falls back
 * to the first `limit` files when no block matches (never preloads nothing).
 *
 * Operates on the rewritten self-hosted CSS (local `/assets/fonts/…` URLs),
 * so it composes with `subsets` filtering for free.
 */
export function pickPreloadHrefs(css: string, primarySubset: string, limit: number): string[] {
  if (limit <= 0) return []
  const hrefOf = (text: string): string | undefined => text.match(/url\((\/[^)]+)\)/)?.[1]
  const blocks = splitSubsetBlocks(css)
  const all = blocks.map((b) => hrefOf(b.text)).filter((h): h is string => h !== undefined)
  const primary = blocks
    .filter((b) => b.subset === primarySubset)
    .map((b) => hrefOf(b.text))
    .filter((h): h is string => h !== undefined)
  const chosen = primary.length > 0 ? primary : all
  return chosen.slice(0, limit)
}

/**
 * Cache key for a self-host request. The subset allowlist is folded into the
 * identity so two configs that differ ONLY in `subsets` cannot collide on a
 * stale `node_modules/.cache/zero-fonts` entry (filtering happens AFTER the
 * download, so a `cssUrl`-only key would serve wrong-subset output on a warm
 * rebuild).
 */
export function fontCacheKey(cssUrl: string, allowedSubsets?: string[]): string {
  return Buffer.from(`${cssUrl}|subsets=${allowedSubsets?.join(',') ?? ''}`).toString('base64url')
}

/**
 * Self-host Google Fonts: download CSS + font files, rewrite URLs to local paths.
 *
 * `allowedSubsets` (optional) narrows the emitted `@font-face` blocks —
 * and therefore the downloaded `woff2` files — to that subset allowlist
 * before extracting URLs, so one filter governs downloads, emitted
 * assets, and the inlined CSS at once.
 */
async function selfHostFonts(
  cssUrl: string,
  fontsSubDir: string,
  root: string,
  allowedSubsets?: string[],
): Promise<{
  css: string
  fontFiles: Array<{ name: string; content: Buffer }>
}> {
  // Cache fonts between builds to avoid re-downloading (~6s penalty).
  const cacheDir = join(root, 'node_modules', '.cache', 'zero-fonts')
  const cachePath = join(cacheDir, `${fontCacheKey(cssUrl, allowedSubsets)}.json`)

  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf-8'))
    if (cached.css && cached.fontFiles) {
      return {
        css: cached.css,
        fontFiles: cached.fontFiles.map((f: any) => ({
          name: f.name,
          content: Buffer.from(f.content, 'base64'),
        })),
      }
    }
  } catch {
    // No cache — download fresh
  }

  const rawCss = await downloadGoogleFontsCSS(cssUrl)
  // Filter BEFORE extracting URLs: dropped subset blocks never get
  // downloaded, never get emitted, and never appear in the inlined CSS.
  const css =
    allowedSubsets && allowedSubsets.length > 0
      ? filterCssBySubsets(rawCss, allowedSubsets)
      : rawCss
  const fontUrls = extractFontUrls(css)
  const fontFiles: Array<{ name: string; content: Buffer }> = []

  let rewrittenCss = css

  for (const url of fontUrls) {
    const urlParts = url.split('/')
    const fileName = urlParts.at(-1)?.split('?')[0] ?? 'font'
    const content = await downloadFontFile(url)

    fontFiles.push({ name: fileName, content })
    rewrittenCss = rewrittenCss.replace(url, `/${fontsSubDir}/${fileName}`)
  }

  // Write cache
  try {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify({
      css: rewrittenCss,
      fontFiles: fontFiles.map((f) => ({ name: f.name, content: f.content.toString('base64') })),
    }))
  } catch {
    // Cache write failure is non-fatal
  }

  return { css: rewrittenCss, fontFiles }
}

/**
 * Zero font optimization Vite plugin.
 *
 * Dev mode: injects Google Fonts CDN link for fast startup.
 * Build mode: downloads and self-hosts fonts for maximum performance + privacy.
 *
 * @example
 * import { fontPlugin } from "@pyreon/zero/font"
 *
 * export default {
 *   plugins: [
 *     pyreon(),
 *     zero(),
 *     fontPlugin({
 *       google: ["Inter:wght@400;500;600;700", "JetBrains Mono:wght@400"],
 *       fallbacks: {
 *         "Inter": { fallback: "Arial", sizeAdjust: 1.07, ascentOverride: 90 },
 *       },
 *     }),
 *   ],
 * }
 */
export function fontPlugin(config: FontConfig = {}): Plugin {
  const display = config.display ?? 'swap'
  const shouldPreload = config.preload !== false
  const shouldSelfHost = config.selfHost !== false
  const googleFamilies = (config.google ?? []).map(resolveGoogleFont)

  let isBuild = false
  let root = ''
  let selfHostedCSS = ''
  let selfHostedFontFiles: Array<{ name: string; content: Buffer }> = []

  return {
    name: 'pyreon-zero-fonts',

    configResolved(resolvedConfig) {
      isBuild = resolvedConfig.command === 'build'
      root = resolvedConfig.root
    },

    async buildStart() {
      if (isBuild && shouldSelfHost && googleFamilies.length > 0) {
        const cssUrl = googleFontsUrl(googleFamilies, display)
        try {
          const result = await selfHostFonts(cssUrl, 'assets/fonts', root, config.subsets)
          selfHostedCSS = result.css
          selfHostedFontFiles = result.fontFiles
        } catch {
          // Self-hosting failed — fall back to CDN link
        }
      }
    },

    generateBundle() {
      // Emit self-hosted font files as assets
      for (const file of selfHostedFontFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/fonts/${file.name}`,
          source: file.content,
        })
      }
    },

    transformIndexHtml(html) {
      const tags: string[] = []

      collectGoogleFontTags(tags, {
        isBuild,
        selfHostedCSS,
        shouldPreload,
        googleFamilies,
        display,
        subsets: config.subsets,
      })
      collectLocalFontTags(tags, config, shouldPreload, display)

      if (tags.length === 0) return html
      return html.replace('</head>', `${tags.join('\n')}\n</head>`)
    },
  }
}

function collectGoogleFontTags(
  tags: string[],
  opts: {
    isBuild: boolean
    selfHostedCSS: string
    shouldPreload: boolean
    googleFamilies: ResolvedFont[]
    display: FontDisplay
    subsets?: string[] | undefined
  },
) {
  if (opts.isBuild && opts.selfHostedCSS) {
    tags.push(`<style>${opts.selfHostedCSS}</style>`)
    if (opts.shouldPreload) {
      // Preload the PRIMARY subset's file(s) — `latin` by default, or the
      // first configured subset — never the cyrillic-ext file css2 happens
      // to return first. Budget preserved at one file per family.
      const primary = opts.subsets?.[0] ?? 'latin'
      for (const href of pickPreloadHrefs(opts.selfHostedCSS, primary, opts.googleFamilies.length)) {
        const ext = href.split('.').pop()
        const type = ext === 'woff2' ? 'font/woff2' : 'font/woff'
        tags.push(`<link rel="preload" href="${href}" as="font" type="${type}" crossorigin>`)
      }
    }
  } else if (opts.googleFamilies.length > 0) {
    const cssUrl = googleFontsUrl(opts.googleFamilies, opts.display)
    tags.push(`<link rel="preconnect" href="https://fonts.googleapis.com">`)
    tags.push(`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`)
    tags.push(`<link rel="stylesheet" href="${cssUrl}">`)
  }
}

function collectLocalFontTags(
  tags: string[],
  config: FontConfig,
  shouldPreload: boolean,
  display: FontDisplay,
) {
  if (shouldPreload && config.local?.length) {
    tags.push(preloadTags(config.local))
  }
  if (config.local?.length) {
    tags.push(`<style>${localFontFaces(config.local, display)}</style>`)
  }
  if (config.fallbacks && Object.keys(config.fallbacks).length > 0) {
    tags.push(`<style>${fallbackFontFaces(config.fallbacks)}</style>`)
  }
}

/**
 * Generate CSS variables for font families.
 */
export function fontVariables(families: Record<string, string>): string {
  const vars = Object.entries(families)
    .map(([key, value]) => `  --font-${key}: ${value};`)
    .join('\n')
  return `:root {\n${vars}\n}`
}
