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
          const parts = entry.split(',')
          const weight = Number(parts[parts.length - 1])
          if (weight > 0) weights.add(weight)
          // Detect italic from tuple: "1,xxx" means italic
          if (parts[0] === '1') italic = true
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
    throw new Error(`Failed to fetch Google Fonts CSS: ${response.status}`)
  }
  return response.text()
}

/**
 * Download a font file.
 */
async function downloadFontFile(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to download font: ${url}`)
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
 * Self-host Google Fonts: download CSS + font files, rewrite URLs to local paths.
 */
async function selfHostFonts(
  cssUrl: string,
  fontsSubDir: string,
): Promise<{
  css: string
  fontFiles: Array<{ name: string; content: Buffer }>
}> {
  const css = await downloadGoogleFontsCSS(cssUrl)
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
  let selfHostedCSS = ''
  let selfHostedFontFiles: Array<{ name: string; content: Buffer }> = []

  return {
    name: 'pyreon-zero-fonts',

    configResolved(resolvedConfig) {
      isBuild = resolvedConfig.command === 'build'
    },

    async buildStart() {
      if (isBuild && shouldSelfHost && googleFamilies.length > 0) {
        const cssUrl = googleFontsUrl(googleFamilies, display)
        try {
          const result = await selfHostFonts(cssUrl, 'assets/fonts')
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
        selfHostedFontFiles,
        shouldPreload,
        googleFamilies,
        display,
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
    selfHostedFontFiles: Array<{ name: string; content: Buffer }>
    shouldPreload: boolean
    googleFamilies: ResolvedFont[]
    display: FontDisplay
  },
) {
  if (opts.isBuild && opts.selfHostedCSS) {
    tags.push(`<style>${opts.selfHostedCSS}</style>`)
    if (opts.shouldPreload) {
      for (const file of opts.selfHostedFontFiles.slice(0, opts.googleFamilies.length)) {
        const ext = file.name.split('.').pop()
        const type = ext === 'woff2' ? 'font/woff2' : 'font/woff'
        tags.push(
          `<link rel="preload" href="/assets/fonts/${file.name}" as="font" type="${type}" crossorigin>`,
        )
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
