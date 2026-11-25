// ─── font-import-helpers.ts ────────────────────────────────────────────────
//
// Internal: font metadata inference, query overrides, hashing and the
// descriptor module `fontImportPlugin` emits. Split out of the public entry
// `font-import-plugin.ts`, which imports from here, so these helpers are not
// public API; their unit tests reach them through
// `@pyreon/zero/internal-server`.

import { basename, extname } from 'node:path'
import { createHash } from 'node:crypto'
import type { FontDescriptor } from './font-import-plugin'

/** ─── Pure helpers (exported for testing) ─────────────────────────────── */

/**
 * Map font file extension to its IANA MIME type. Mirrors
 * `inferFontMimeType` from `use-preload-font.ts`; duplicated here to
 * keep `font-import-plugin` server-side-only (no dep on a client
 * module). Pre-load contract is identical.
 *
 * @internal exported for testing
 */
export function fontMimeType(ext: string): string {
  switch (ext.toLowerCase().replace(/^\./, '')) {
    case 'woff2':
      return 'font/woff2'
    case 'woff':
      return 'font/woff'
    case 'ttf':
      return 'font/ttf'
    case 'otf':
      return 'font/otf'
    case 'eot':
      return 'application/vnd.ms-fontobject'
    default:
      return 'font/woff2'
  }
}

/**
 * `format()` value for the @font-face `src: url(...) format('woff2')`
 * descriptor. Browsers use this to skip unsupported formats — a
 * mismatch silently downloads the wrong file.
 *
 * @internal exported for testing
 */
export function fontFormat(ext: string): string {
  switch (ext.toLowerCase().replace(/^\./, '')) {
    case 'woff2':
      return 'woff2'
    case 'woff':
      return 'woff'
    case 'ttf':
      return 'truetype'
    case 'otf':
      return 'opentype'
    case 'eot':
      return 'embedded-opentype'
    default:
      return 'woff2'
  }
}

/**
 * Auto-extract family/weight/style from a filename. Overridden by
 * explicit query params. Encodes the convention documented in JSDoc:
 *
 *   display-bold.woff2          → { family: 'display-bold', weight: 400, style: 'normal' }
 *   inter-700.woff2             → { family: 'inter',       weight: 700, style: 'normal' }
 *   inter-italic.woff2          → { family: 'inter',       weight: 400, style: 'italic' }
 *   inter-700-italic.woff2      → { family: 'inter',       weight: 700, style: 'italic' }
 *
 * @internal exported for testing
 */
export function inferFontMeta(filename: string): { family: string; weight: number; style: 'normal' | 'italic' | 'oblique' } {
  const stem = basename(filename, extname(filename))
  // Tokens split on `-` / `_`.
  const tokens = stem.split(/[-_]/)
  let weight = 400
  let style: 'normal' | 'italic' | 'oblique' = 'normal'
  const familyTokens: string[] = []
  for (const tok of tokens) {
    const lower = tok.toLowerCase()
    // Numeric weight
    if (/^\d{3}$/.test(tok)) {
      const n = parseInt(tok, 10)
      if (n >= 100 && n <= 900) {
        weight = n
        continue
      }
    }
    // Style keywords
    if (lower === 'italic' || lower === 'oblique') {
      style = lower
      continue
    }
    // Weight name keywords (named weights map per CSS spec)
    const weightName = WEIGHT_NAMES[lower]
    if (weightName !== undefined) {
      weight = weightName
      continue
    }
    familyTokens.push(tok)
  }
  const family = familyTokens.length > 0 ? familyTokens.join('-') : stem

  return { family, weight, style }
}

const WEIGHT_NAMES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
}

/**
 * Parse query-string overrides for family/weight/style. Returns
 * undefined for any key not in the query — caller falls back to
 * filename inference.
 *
 * @internal exported for testing
 */
export function parseFontQueryOverrides(query: string): {
  family?: string
  weight?: number
  style?: 'normal' | 'italic' | 'oblique'
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
} {
  const params = new URLSearchParams(query)
  const result: {
    family?: string
    weight?: number
    style?: 'normal' | 'italic' | 'oblique'
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  } = {}
  const f = params.get('family')
  if (f) result.family = f
  const w = params.get('weight')
  if (w) {
    const n = parseInt(w, 10)
    if (Number.isFinite(n)) result.weight = n
  }
  const s = params.get('style')
  if (s === 'italic' || s === 'normal' || s === 'oblique') result.style = s
  // `?font&display=optional` — per-import font-display override (the default
  // is `swap`; display faces / decorative fonts often want `optional` so a
  // slow load skips the font entirely instead of swapping late).
  const d = params.get('display')
  if (d === 'auto' || d === 'block' || d === 'swap' || d === 'fallback' || d === 'optional') {
    result.display = d
  }

  return result
}

/**
 * Compute the deterministic hashed filename for a font given its
 * content. Same input → same output, so identical fonts at different
 * source paths dedup at the dist level.
 *
 * @internal exported for testing
 */
export function hashFontFilename(content: Buffer | Uint8Array, originalName: string): string {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8)
  const stem = basename(originalName, extname(originalName))
  const ext = extname(originalName)

  return `${stem}-${hash}${ext}`
}

/**
 * Build the `@font-face` rule string for a descriptor. Deterministic
 * given identical inputs; safe to bundle as a side-effect CSS import.
 *
 * @internal exported for testing
 */
export function buildFontFace(descriptor: {
  family: string
  src: string
  weight: number
  style: string
  display: string
  format: string
}): string {
  return [
    '@font-face {',
    `  font-family: '${descriptor.family}';`,
    `  src: url('${descriptor.src}') format('${descriptor.format}');`,
    `  font-weight: ${descriptor.weight};`,
    `  font-style: ${descriptor.style};`,
    `  font-display: ${descriptor.display};`,
    '}',
  ].join('\n')
}

/**
 * Generate the JS module source that `load()` returns for a `?font`
 * import. The module side-effect-imports the auto-generated @font-face
 * CSS module (so Vite bundles it) and exports a frozen descriptor with
 * a custom `toString()` returning the family name (so
 * `font-family: ${descriptor}` interpolation works).
 *
 * @internal exported for testing
 */
export function emitFontDescriptorModule(
  cssVirtualId: string,
  descriptor: FontDescriptor,
): string {
  // The descriptor object is structurally identical to the type. The
  // toString / valueOf / Symbol.toPrimitive shape mirrors
  // ProcessedImage's compat guardrail (see image-plugin's
  // emitDescriptor) so foreign code that template-literals the
  // descriptor gets the family name without breaking.
  return [
    `import ${JSON.stringify(cssVirtualId)}`,
    `const _d = ${JSON.stringify(descriptor)};`,
    `const _s = () => _d.family;`,
    `Object.defineProperty(_d, 'toString', { value: _s });`,
    `Object.defineProperty(_d, 'valueOf', { value: _s });`,
    `Object.defineProperty(_d, Symbol.toPrimitive, { value: _s });`,
    `export default Object.freeze(_d);`,
  ].join('\n')
}
