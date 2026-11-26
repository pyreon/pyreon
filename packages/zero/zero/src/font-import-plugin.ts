import { existsSync, readFileSync } from 'node:fs'
import { extname, dirname, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import {
  buildFontFace,
  emitFontDescriptorModule,
  fontFormat,
  fontMimeType,
  hashFontFilename,
  inferFontMeta,
  parseFontQueryOverrides,
} from './font-import-helpers'

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
      // `swap` default (never FOIT); overridable per-import via
      // `?font&display=optional` for decorative/display faces.
      const display = overrides.display ?? 'swap'

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
