/**
 * Branded end-of-build summary — the "what did this build actually produce"
 * overview printed once, after every zero post-step (SSG prerender, SSR
 * bundle, adapter staging) has finished:
 *
 *   - client assets with raw + gzip sizes (entry chunks marked, sorted by
 *     gzip cost, long tails collapsed),
 *   - per-kind and overall totals,
 *   - the server bundle (SSR/ISR) and prerendered page count (SSG/hybrid),
 *   - wall-clock build time,
 *
 * in the Pyreon ember palette (plasma → core → warm), degrading cleanly:
 * truecolor → 16-color ANSI → plain (`NO_COLOR` / non-TTY / dumb terminals).
 *
 * Everything here is PURE (collect reads the dist tree; format returns
 * strings) — the printing side-effect lives in `buildSummaryPlugin`
 * (vite-plugin.ts), which appends LAST in the `zero()` chain so its
 * `closeBundle` observes the finished dist tree.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

// ─── Color support ───────────────────────────────────────────────────────────

/** 0 = plain, 1 = 16-color ANSI, 2 = truecolor. */
export type ColorLevel = 0 | 1 | 2

/**
 * Conservative color-capability probe. `NO_COLOR` (spec: any value) and a
 * non-TTY stdout force plain; `FORCE_COLOR` opts back in (CI log viewers);
 * `COLORTERM=truecolor|24bit` unlocks the ember gradient.
 */
export function detectColorLevel(
  env: Record<string, string | undefined> = process.env,
  isTTY: boolean = Boolean(process.stdout && process.stdout.isTTY),
): ColorLevel {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 0
  if (env.TERM === 'dumb') return 0
  const forced = env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0'
  if (!isTTY && !forced) return 0
  const colorterm = env.COLORTERM ?? ''
  if (colorterm.includes('truecolor') || colorterm.includes('24bit')) return 2
  return 1
}

// The Pyreon brand ember ramp (docs/src/styles/tokens.css) + 16-color fallbacks.
const EMBER = {
  plasma: { rgb: [255, 31, 140], basic: 35 /* magenta */ },
  core: { rgb: [255, 94, 26], basic: 31 /* red — closest 16-color to ember orange */ },
  warm: { rgb: [255, 200, 61], basic: 33 /* yellow */ },
} as const

type EmberTone = keyof typeof EMBER

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const tone = (level: ColorLevel, name: EmberTone, s: string, bold = false): string => {
  if (level === 0) return s
  const t = EMBER[name]
  const open =
    level === 2 ? `\x1b[38;2;${t.rgb[0]};${t.rgb[1]};${t.rgb[2]}m` : `\x1b[${t.basic}m`
  return `${bold ? BOLD : ''}${open}${s}${RESET}`
}

const dim = (level: ColorLevel, s: string): string => (level === 0 ? s : `${DIM}${s}${RESET}`)
const bold = (level: ColorLevel, s: string): string => (level === 0 ? s : `${BOLD}${s}${RESET}`)

/**
 * The brand mark: "▲ pyreon zero" with the ember ramp swept across the word
 * when truecolor is available, ember-core at 16 colors, plain otherwise.
 */
export function emberBrand(level: ColorLevel, label = 'pyreon zero'): string {
  const mark = '▲'
  if (level === 0) return `${mark} ${label}`
  if (level === 1) return tone(1, 'core', `${mark} ${label}`, true)
  // Truecolor: interpolate plasma → core → warm across the label.
  const stops = [EMBER.plasma.rgb, EMBER.core.rgb, EMBER.warm.rgb]
  const chars = [...label]
  let out = `${BOLD}\x1b[38;2;${EMBER.core.rgb.join(';')}m${mark}${RESET} ${BOLD}`
  for (let i = 0; i < chars.length; i++) {
    const t = chars.length === 1 ? 0 : (i / (chars.length - 1)) * (stops.length - 1)
    const seg = Math.min(Math.floor(t), stops.length - 2)
    const f = t - seg
    const a = stops[seg] as readonly number[]
    const b = stops[seg + 1] as readonly number[]
    const r = Math.round((a[0] as number) + ((b[0] as number) - (a[0] as number)) * f)
    const g = Math.round((a[1] as number) + ((b[1] as number) - (a[1] as number)) * f)
    const bl = Math.round((a[2] as number) + ((b[2] as number) - (a[2] as number)) * f)
    out += `\x1b[38;2;${r};${g};${bl}m${chars[i]}`
  }
  return `${out}${RESET}`
}

/** Ember tone per render mode — shared by the route-mode table. */
const MODE_TONE: Record<string, EmberTone> = {
  ssg: 'warm',
  ssr: 'core',
  isr: 'plasma',
  spa: 'plasma',
}

/** Colorize a route-mode fragment (glyph + mode word) in its ember tone. */
export function colorizeMode(level: ColorLevel, mode: string, s: string): string {
  const t = MODE_TONE[mode]
  return t === undefined ? s : tone(level, t, s)
}

// ─── Collection ──────────────────────────────────────────────────────────────

export type AssetKind = 'js' | 'css' | 'other'

export interface AssetStat {
  /** Path relative to outDir, POSIX separators. */
  file: string
  kind: AssetKind
  bytes: number
  /** Gzipped size for compressible kinds; null for images/fonts/binaries. */
  gzipBytes: number | null
  /** Referenced directly by the built index.html (the initial payload). */
  entry: boolean
}

export interface BuildStats {
  clientAssets: AssetStat[]
  /** Prerendered page HTML under outDir (excluding dist/server). */
  prerendered: { count: number; bytes: number }
  /** Top-level files of dist/server when an SSR/ISR bundle was emitted. */
  server: Array<{ file: string; bytes: number }>
}

const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.webmanifest'])

const extOf = (file: string): string => {
  const i = file.lastIndexOf('.')
  return i === -1 ? '' : file.slice(i).toLowerCase()
}

const kindOf = (file: string): AssetKind => {
  const ext = extOf(file)
  if (ext === '.js' || ext === '.mjs') return 'js'
  if (ext === '.css') return 'css'
  return 'other'
}

/**
 * One `statSync` per file, captured at walk time — every consumer reuses the
 * size instead of re-stat'ing (no check-then-use pair: a dist file changing
 * mid-summary is a build-tooling race we tolerate, and the later
 * `readFileSync` calls are individually try/catch-guarded, CodeQL
 * `js/file-system-race`).
 */
const walk = (dir: string, out: Array<{ path: string; size: number }> = []): Array<{ path: string; size: number }> => {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue // vanished between readdir and stat — skip
    }
    if (st.isDirectory()) walk(full, out)
    else out.push({ path: full, size: st.size })
  }
  return out
}

/** Gzipped byte size, or null when the file can't be read (racing writer). */
const gzipSizeOf = (file: string): number | null => {
  try {
    return gzipSync(readFileSync(file)).length
  } catch {
    return null
  }
}

/**
 * Read the finished dist tree into a `BuildStats`. Pure with respect to the
 * tree (no globals); tolerant of every partial shape (no assets dir, no
 * server dir, SPA with a single index.html).
 */
export function collectBuildStats(outDir: string, assetsDir = 'assets'): BuildStats {
  // Entry chunks: whatever the built index.html references directly.
  let indexHtml = ''
  try {
    indexHtml = readFileSync(join(outDir, 'index.html'), 'utf8')
  } catch {
    /* no root index.html (e.g. pure API deploys) — nothing marked entry */
  }

  const assetsRoot = join(outDir, assetsDir)
  const clientAssets: AssetStat[] = walk(assetsRoot).map(({ path, size }) => {
    const rel = relative(outDir, path).split('\\').join('/')
    const kind = kindOf(path)
    return {
      file: rel,
      kind,
      bytes: size,
      gzipBytes: COMPRESSIBLE.has(extOf(path)) ? gzipSizeOf(path) : null,
      // Entry marker = the INITIAL SCRIPT/STYLE payload. Restricted to
      // js/css: fonts/images referenced by index.html (preload links) would
      // otherwise flood the marker and drown the chunks it exists to surface.
      entry: kind !== 'other' && indexHtml.includes(rel.split('/').pop() as string),
    }
  })

  let prerenderedCount = 0
  let prerenderedBytes = 0
  const serverDir = join(outDir, 'server')
  for (const { path, size } of walk(outDir)) {
    if (path.startsWith(serverDir + '/') || path.startsWith(serverDir + '\\')) continue
    if (extOf(path) !== '.html') continue
    prerenderedCount++
    prerenderedBytes += size
  }

  const server: BuildStats['server'] = []
  try {
    for (const name of readdirSync(serverDir)) {
      let st
      try {
        st = statSync(join(serverDir, name))
      } catch {
        continue
      }
      if (st.isFile()) server.push({ file: `server/${name}`, bytes: st.size })
    }
  } catch {
    /* no server bundle (ssg/spa) */
  }
  server.sort((a, b) => b.bytes - a.bytes)

  return { clientAssets, prerendered: { count: prerenderedCount, bytes: prerenderedBytes }, server }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Vite-convention size: 1000-based kB with one decimal. */
export function formatKB(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const kb = bytes / 1000
  if (kb < 1000) return `${kb.toFixed(1)} kB`
  return `${(kb / 1000).toFixed(2)} MB`
}

export interface FormatSummaryOptions {
  color?: ColorLevel
  /** Wall-clock ms measured by the plugin (buildStart → closeBundle). */
  elapsedMs?: number
  /** Listed asset rows before the tail collapses to "+ N more". */
  maxRows?: number
}

/**
 * Render the summary block. Returns plain lines — the caller prints them.
 * Deterministic for a given stats + options (locked by unit tests).
 */
export function formatBuildSummary(stats: BuildStats, opts: FormatSummaryOptions = {}): string[] {
  const level = opts.color ?? 0
  const maxRows = opts.maxRows ?? 20
  const lines: string[] = []

  lines.push('')
  lines.push(`  ${emberBrand(level)} ${dim(level, 'production build')}`)
  lines.push('')

  // Client assets — entries first, then by gzip (falling back to raw) desc.
  const sorted = [...stats.clientAssets].sort(
    (a, b) =>
      Number(b.entry) - Number(a.entry) ||
      (b.gzipBytes ?? b.bytes) - (a.gzipBytes ?? a.bytes),
  )
  if (sorted.length > 0) {
    lines.push(bold(level, '  Client assets'))
    const nameWidth = Math.min(
      Math.max(...sorted.slice(0, maxRows).map((a) => a.file.length), 12),
      56,
    )
    const listed = sorted.slice(0, maxRows)
    for (const a of listed) {
      const marker = a.entry ? tone(level, 'core', 'entry', true) : dim(level, a.kind.padEnd(5))
      const name = a.file.length > 56 ? `…${a.file.slice(-55)}` : a.file
      const raw = formatKB(a.bytes).padStart(9)
      const gz = a.gzipBytes === null ? '' : ` ${dim(level, '│ gzip')} ${formatKB(a.gzipBytes).padStart(9)}`
      lines.push(`    ${marker}  ${name.padEnd(nameWidth)} ${raw}${gz}`)
    }
    const rest = sorted.slice(maxRows)
    if (rest.length > 0) {
      const restBytes = rest.reduce((n, a) => n + a.bytes, 0)
      lines.push(dim(level, `           + ${rest.length} more (${formatKB(restBytes)})`))
    }

    const byKind = (kind: AssetKind) => stats.clientAssets.filter((a) => a.kind === kind)
    const sum = (as: AssetStat[], gz: boolean) =>
      as.reduce((n, a) => n + (gz ? (a.gzipBytes ?? a.bytes) : a.bytes), 0)
    const js = byKind('js')
    const css = byKind('css')
    const other = byKind('other')
    const parts: string[] = []
    if (js.length) parts.push(`${js.length} js ${formatKB(sum(js, false))} (gzip ${formatKB(sum(js, true))})`)
    if (css.length) parts.push(`${css.length} css ${formatKB(sum(css, false))} (gzip ${formatKB(sum(css, true))})`)
    if (other.length) parts.push(`${other.length} other ${formatKB(sum(other, false))}`)
    lines.push(`    ${tone(level, 'warm', 'Σ', true)}      ${parts.join(dim(level, '  ·  '))}`)
    lines.push('')
  }

  if (stats.server.length > 0) {
    lines.push(bold(level, '  Server bundle'))
    for (const f of stats.server) {
      lines.push(`    ${dim(level, 'file ')}  ${f.file.padEnd(28)} ${formatKB(f.bytes).padStart(9)}`)
    }
    lines.push('')
  }

  if (stats.prerendered.count > 0) {
    lines.push(
      `  ${tone(level, 'warm', '○', true)} ${stats.prerendered.count} prerendered page${stats.prerendered.count === 1 ? '' : 's'} ${dim(level, `(${formatKB(stats.prerendered.bytes)} html)`)}`,
    )
  }

  const time =
    opts.elapsedMs === undefined
      ? ''
      : ` ${dim(level, 'in')} ${bold(level, opts.elapsedMs >= 1000 ? `${(opts.elapsedMs / 1000).toFixed(2)} s` : `${Math.round(opts.elapsedMs)} ms`)}`
  lines.push(`  ${tone(level, 'core', '✓', true)} ${bold(level, 'Build complete')}${time}`)
  lines.push('')
  return lines
}
