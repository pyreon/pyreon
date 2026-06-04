import { existsSync, readFileSync } from 'node:fs'
import { basename, extname, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { Plugin, ResolvedConfig } from 'vite'

// ─── `?font` import plugin ──────────────────────────────────────────────────
//
// Build-time transform: `import display from './fonts/display-bold.woff2?font'`
// returns a typed `FontDescriptor` AND auto-generates the matching
// `@font-face` CSS rule + ships the hashed file to `dist/assets/fonts/`.
//
// The DX win over manual `@font-face` + `usePreloadFont('/fonts/...')`:
//
//   import display from './fonts/display-bold.woff2?font'
//   //     ↑ build-time plugin transforms this
//
//   return <h1 style={`font-family: ${display.family}`}>Hero</h1>
//   //                                  ↑ that's it. No CSS, no usePreloadFont.
//
// What the plugin does:
//
//   1. Hashes the file content + copies it to dist/assets/fonts/
//      (filename: `<name>-<hash8>.<ext>`). Hash is content-addressed so
//      identical fonts at different paths dedup to ONE file.
//
//   2. Auto-extracts `family` from the filename:
//        display-bold.woff2  → family: 'display-bold'
//      (override via query: `?font&family=Display`)
//
//   3. Auto-extracts `weight` from the filename suffix when numeric:
//        inter-700.woff2     → weight: 700
//        display-bold.woff2  → weight: 400 (default)
//      (override via query: `?font&weight=700`)
//
//   4. Auto-extracts `style` from filename hints:
//        inter-italic.woff2  → style: 'italic'
//      (override via query: `?font&style=italic`)
//
//   5. Generates `@font-face` CSS bundled as a side-effect import in
//      the JS module — Vite's CSS pipeline picks it up, includes it in
//      the route's CSS bundle, and the user never writes @font-face
//      by hand.
//
// `usePreloadFont` accepts the returned descriptor directly:
//
//   usePreloadFont(display)
//
// so URL drift is impossible (the hashed src and the preload URL are
// the same object). The descriptor's `toString()` returns the
// family name, so `font-family: ${display}` interpolation works too.

/** Per-font config — most fields auto-inferred; overrides via query params. */
export interface FontDescriptor {
  /**
   * The CSS `font-family` name. Auto-extracted from the filename
   * (`display-bold.woff2` → `'display-bold'`). Override via
   * `?font&family=DisplayBold`.
   */
  family: string
  /**
   * Hashed URL the font is served from. `/assets/fonts/<name>-<hash8>.<ext>`
   * in production; the raw `/@fs/` path in dev. Use this in
   * `usePreloadFont(descriptor)` or read directly for custom `@font-face`.
   */
  src: string
  /**
   * `font-weight`. Auto-extracted from numeric filename suffix
   * (`inter-700.woff2` → `700`). Default `400`. Override via
   * `?font&weight=700`.
   */
  weight: number
  /**
   * `font-style`. Auto-extracted from filename (`-italic` → `'italic'`).
   * Default `'normal'`. Override via `?font&style=italic`.
   */
  style: 'normal' | 'italic' | 'oblique'
  /**
   * `font-display` value applied to the auto-generated `@font-face`.
   * Default `'swap'` (matches `fontPlugin`'s convention — no FOIT).
   */
  display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  /**
   * MIME type — passed straight to `usePreloadFont(descriptor)` so the
   * preload `<link type=...>` matches. Inferred from extension.
   */
  type: string
  /**
   * Resolved `@font-face` CSS rule for this font. Useful for tests or
   * for code-paths that want to inject the rule manually instead of
   * relying on Vite's CSS pipeline.
   */
  fontFace: string
}

/**
 * Plugin config. Currently empty — all per-file options are passed
 * via query params on the `?font` import. Reserved as an extension
 * point for future global defaults (e.g. a global `display` override).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FontImportPluginConfig {}

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
} {
  const params = new URLSearchParams(query)
  const result: { family?: string; weight?: number; style?: 'normal' | 'italic' | 'oblique' } = {}
  const f = params.get('family')
  if (f) result.family = f
  const w = params.get('weight')
  if (w) {
    const n = parseInt(w, 10)
    if (Number.isFinite(n)) result.weight = n
  }
  const s = params.get('style')
  if (s === 'italic' || s === 'normal' || s === 'oblique') result.style = s
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

/** ─── The Vite plugin ─────────────────────────────────────────────────── */

const VIRTUAL_FONT_PREFIX = '\0virtual:zero-font:'
const VIRTUAL_FONT_FACE_PREFIX = '\0virtual:zero-font-face:'

/**
 * Vite plugin that transforms `import x from './path.woff2?font'`
 * imports into `FontDescriptor` modules with auto-generated `@font-face`
 * CSS and hashed font URLs.
 *
 * Auto-wired by `zero({ font: ... })` (always on — there's no cost
 * unless a `?font` query is actually used). Opt out via `zero({ font: false })`
 * (same flag that disables `fontPlugin`).
 *
 * @example
 * import display from './fonts/display-bold.woff2?font'
 * import display700 from './fonts/inter.woff2?font&family=Inter&weight=700'
 */
export function fontImportPlugin(config: FontImportPluginConfig = {}): Plugin {
  let resolvedConfig: ResolvedConfig | undefined
  // Map of resolved-id → hashed-asset-filename — populated at load().
  // Mirrors imagePlugin's per-build cache.
  const emittedAssets = new Map<string, { hashedName: string; descriptor: FontDescriptor }>()

  // Empty-object config today — reserved for future global defaults.
  void config

  return {
    name: 'pyreon-zero-font-import',

    configResolved(c) {
      resolvedConfig = c
    },

    async resolveId(source, importer) {
      // CSS virtual ids — return as-is so they go to load(). Must be
      // checked BEFORE the `?font` filter (CSS ids don't carry it).
      if (source.startsWith(VIRTUAL_FONT_FACE_PREFIX)) return source
      // Match `*.{woff2,woff,ttf,otf,eot}?font` queries — extension is
      // load-bearing because format() in @font-face needs to match.
      if (!source.includes('?font')) return null
      // Standard ?font import. Use Vite's resolver to get the absolute path
      // (mirrors imagePlugin's pattern for importer-relative + alias-aware).
      const [bare, query] = source.split('?')
      if (!bare) return null
      const ext = extname(bare).toLowerCase()
      if (!['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(ext)) return null
      let absPath: string
      if (source.startsWith('/')) {
        // Public-dir web path — keep as-is; loader will resolve.
        absPath = bare
      } else if (importer) {
        const resolved = await (this as { resolve?: (s: string, f?: string) => Promise<{ id: string } | null> }).resolve?.(
          bare,
          importer,
        )
        if (resolved) {
          absPath = resolved.id
        } else {
          absPath = resolve(dirname(importer), bare)
        }
      } else {
        absPath = bare
      }
      return `${VIRTUAL_FONT_PREFIX}${absPath}?${query}`
    },

    load(id) {
      // CSS side-effect import: return the @font-face rule.
      if (id.startsWith(VIRTUAL_FONT_FACE_PREFIX)) {
        const realId = id.slice(VIRTUAL_FONT_FACE_PREFIX.length)
        const entry = emittedAssets.get(realId)
        if (!entry) return null
        return entry.descriptor.fontFace
      }
      // Main ?font module: hash + emit + return descriptor JS.
      if (!id.startsWith(VIRTUAL_FONT_PREFIX)) return null
      const [absPathWithQuery] = [id.slice(VIRTUAL_FONT_PREFIX.length)]
      const [absPath, query = ''] = absPathWithQuery.split('?')
      if (!absPath) return null

      const ext = extname(absPath).toLowerCase()
      if (!['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(ext)) {
        return null
      }

      // Read file contents — required for hashing + emitting. Fall
      // back to the consumer's `public/` dir when the path looks like
      // a web-root path (`/logo.woff2`) and isn't a real fs path.
      let realPath = absPath
      if (!existsSync(realPath)) {
        const root = resolvedConfig?.root ?? process.cwd()
        const publicPath = resolve(root, 'public', absPath.replace(/^\//, ''))
        if (existsSync(publicPath)) {
          realPath = publicPath
        } else {
          throw new Error(`[Pyreon] font file not found: ${absPath}`)
        }
      }
      const content = readFileSync(realPath)
      const isBuild = resolvedConfig?.command === 'build'

      const overrides = parseFontQueryOverrides(query)
      const inferred = inferFontMeta(absPath)
      const family = overrides.family ?? inferred.family
      const weight = overrides.weight ?? inferred.weight
      const style = overrides.style ?? inferred.style
      const mime = fontMimeType(ext)
      const fmt = fontFormat(ext)
      const display = 'swap'

      let src: string
      if (isBuild) {
        // Emit hashed asset; Vite resolves the public URL during the
        // bundle step.
        const hashedName = hashFontFilename(content, absPath)
        const fileHandle = this.emitFile({
          type: 'asset',
          fileName: `assets/fonts/${hashedName}`,
          source: content,
        })
        src = `__VITE_ASSET__${fileHandle}__`
      } else {
        // Dev mode — serve the file via /@fs/ (Vite's escape hatch for
        // outside-root paths). Mirrors imagePlugin's dev path.
        src = `/@fs/${absPath}`
      }

      const fontFace = buildFontFace({ family, src, weight, style, display, format: fmt })
      const descriptor: FontDescriptor = {
        family,
        src,
        weight,
        style,
        display,
        type: mime,
        fontFace,
      }
      emittedAssets.set(absPath, { hashedName: src, descriptor })

      const cssVirtualId = `${VIRTUAL_FONT_FACE_PREFIX}${absPath}`
      return emitFontDescriptorModule(cssVirtualId, descriptor)
    },
  }
}
