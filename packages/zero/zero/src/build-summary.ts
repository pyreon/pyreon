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
import { readSsgOutcome } from './ssg-outcome'

import {
  columns,
  createTerm,
  formatElapsed,
  header,
  plural,
  type Role,
  verdict,
} from '@pyreon/ansi'

// ─── Color support ───────────────────────────────────────────────────────────
// Colour level, palette and symbols come from `@pyreon/ansi`, the one theme
// every Pyreon command shares.

/** 0 = plain, 1 = 16 colours, 2 = 256 colours, 3 = truecolor (the `@pyreon/ansi` levels). */
export type ColorLevel = 0 | 1 | 2 | 3

/** Palette role per render mode, shared by the route-mode table. `spa` stays plain. */
const MODE_ROLE: Record<string, Role> = {
  ssg: 'info',
  ssr: 'accent',
  isr: 'warn',
}

/** Colorize a route-mode fragment (glyph + mode word) in its palette role. */
export function colorizeMode(level: ColorLevel, mode: string, s: string): string {
  const role = MODE_ROLE[mode]
  return role === undefined ? s : createTerm({ level, unicode: true }).paint(role, s)
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
  /**
   * Prerendered page HTML under outDir (excluding dist/server).
   *
   * `count` is what the prerender pass actually RENDERED when it reported an
   * outcome, not the number of `.html` files on disk — a failed path leaves
   * its untouched shell behind, and counting files reported that shell as a
   * rendered page. `failed` is non-zero only when paths threw; `bytes` stays
   * disk-derived, since the bytes really are there either way.
   */
  prerendered: { count: number; bytes: number; failed?: number; errorArtifact?: string }
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

  // Prefer the prerender pass's own numbers. Walking the filesystem cannot
  // distinguish a rendered page from the shell a FAILED render left behind,
  // which is exactly how a 4-of-5 build reported "5 prerendered pages".
  const outcome = readSsgOutcome()
  const prerendered = outcome
    ? {
        count: outcome.rendered,
        bytes: prerenderedBytes,
        ...(outcome.failed > 0 ? { failed: outcome.failed } : {}),
        ...(outcome.errorArtifact ? { errorArtifact: outcome.errorArtifact } : {}),
      }
    : { count: prerenderedCount, bytes: prerenderedBytes }

  return { clientAssets, prerendered, server }
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
  /**
   * The terminal to render for. Default: no colour, dark, Unicode symbols,
   * so the output is deterministic; the plugin passes what it detected.
   */
  color?: ColorLevel | undefined
  theme?: 'dark' | 'light' | undefined
  unicode?: boolean | undefined
  /** Header context, e.g. `ssg · adapter: vercel`. */
  context?: string | undefined
  /** Wall-clock ms measured by the plugin (buildStart → closeBundle). */
  elapsedMs?: number | undefined
  /** Listed asset rows before the tail collapses to "+ N more". */
  maxRows?: number | undefined
}

/**
 * Render the summary block. Returns plain lines; the caller prints them.
 * Deterministic for a given stats + options (locked by unit tests).
 *
 * Shape (the shared CLI rules): a header naming what ran, aligned columns
 * with right-aligned sizes, full paths (never truncated), and a last line
 * that is the verdict with counts and elapsed time.
 */
export function formatBuildSummary(stats: BuildStats, opts: FormatSummaryOptions = {}): string[] {
  const t = createTerm({ level: opts.color ?? 0, theme: opts.theme ?? 'dark', unicode: opts.unicode ?? true })
  const maxRows = opts.maxRows ?? 20
  const lines: string[] = []

  lines.push('')
  lines.push(`  ${header(t, 'zero build', opts.context ?? 'production build')}`)
  lines.push('')

  // Client assets: entries first, then by gzip (falling back to raw) desc.
  const sorted = [...stats.clientAssets].sort(
    (a, b) =>
      Number(b.entry) - Number(a.entry) ||
      (b.gzipBytes ?? b.bytes) - (a.gzipBytes ?? a.bytes),
  )
  if (sorted.length > 0) {
    const listed = sorted.slice(0, maxRows)
    const rows: string[][] = [
      [t.underline('asset'), '', t.underline('size'), t.underline('gzip')],
      ...listed.map((a) => [
        a.file,
        a.entry ? t.accent('entry') : t.dim(a.kind),
        formatKB(a.bytes),
        a.gzipBytes === null ? t.dim('—') : formatKB(a.gzipBytes),
      ]),
    ]
    const rest = sorted.slice(maxRows)
    if (rest.length > 0) {
      const restBytes = rest.reduce((n, a) => n + a.bytes, 0)
      rows.push([t.dim(`+ ${rest.length} more`), '', t.dim(formatKB(restBytes)), ''])
    }

    const byKind = (kind: AssetKind) => stats.clientAssets.filter((a) => a.kind === kind)
    const sum = (as: AssetStat[], gz: boolean) =>
      as.reduce((n, a) => n + (gz ? (a.gzipBytes ?? a.bytes) : a.bytes), 0)
    for (const [kind, label] of [['js', 'js'], ['css', 'css'], ['other', 'other']] as const) {
      const as = byKind(kind)
      if (as.length === 0) continue
      rows.push([
        t.bold(`total ${label}`),
        t.dim(plural(as.length, 'file')),
        formatKB(sum(as, false)),
        kind === 'other' ? '' : formatKB(sum(as, true)),
      ])
    }
    lines.push(...columns(rows, { align: ['left', 'left', 'right', 'right'] }))
    lines.push('')
  }

  if (stats.server.length > 0) {
    lines.push(
      ...columns(
        [[t.underline('server bundle'), t.underline('size')], ...stats.server.map((f) => [f.file, formatKB(f.bytes)])],
        { align: ['left', 'right'] },
      ),
    )
    lines.push('')
  }

  const failed = stats.prerendered.failed ?? 0
  if (failed > 0) {
    // The build continues past a failed path on purpose (one bad route must
    // not kill a thousand-page build: that is what `ssg.onPathError` and the
    // errors artifact are for). Reporting it as a success is not part of
    // that bargain, so the verdict below says so too.
    lines.push(
      `  ${t.err(t.sym('err'))} ${plural(failed, 'page')} FAILED to prerender ${t.sym('dash')} ${
        stats.prerendered.errorArtifact ?? 'see the errors above'
      }`,
    )
    lines.push(
      `    ${t.dim(`the client shell is still on disk for ${failed === 1 ? 'it' : 'them'}, so ${failed === 1 ? 'that URL serves' : 'those URLs serve'} an empty page`)}`,
    )
    lines.push('')
  }

  const pages = stats.prerendered.count
  const time = opts.elapsedMs === undefined ? '' : ` in ${formatElapsed(opts.elapsedMs)}`
  lines.push(
    `  ${verdict(t, failed > 0 ? 'err' : 'ok', failed > 0 ? `built with ${plural(failed, 'failed page')}${time}` : `built${time}`, [
      sorted.length > 0 && plural(sorted.length, 'asset'),
      (pages > 0 || failed > 0) && `${plural(pages, 'prerendered page')} (${formatKB(stats.prerendered.bytes)} html)`,
      stats.server.length > 0 && `server ${formatKB(stats.server.reduce((n, f) => n + f.bytes, 0))}`,
    ])}`,
  )
  lines.push('')
  return lines
}
