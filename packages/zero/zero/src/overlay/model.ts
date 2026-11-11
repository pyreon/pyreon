/**
 * The data behind zero's development error overlay, and the pure functions
 * that build it: stack parsing and classification, code-frame extraction,
 * the "How to fix it" lookup and the plain-text copy for an AI assistant.
 *
 * Client-safe: no `node:*` import. The server renderer (`error-overlay.ts`)
 * reads the source file and hands the text in; the hydration overlay
 * (`dev-overlay.ts`) runs this in the browser.
 */
import { diagnoseError } from '@pyreon/compiler/diagnose'

/** What failed. Each kind has its own chip and phase label. */
export type OverlayKind = 'render' | 'loader' | 'middleware' | 'server' | 'hydration'

export interface StackFrame {
  /** Function name, or `''` for an anonymous frame. */
  fn: string
  /** File path or URL exactly as the stack printed it. */
  file: string
  line?: number | undefined
  column?: number | undefined
  /** Library code: `node_modules`, Node internals, or anything outside the app root. */
  library: boolean
  /** Short location for display: a root-relative path, or a package name for library frames. */
  where: string
}

export interface CodeFrameLine {
  number: number
  text: string
  highlight: boolean
}

export interface CodeFrame {
  lines: CodeFrameLine[]
  /** 1-based column of the caret on the highlighted line, after tab expansion. */
  caret?: number | undefined
}

export interface OverlayFix {
  cause: string
  fix: string
  fixCode?: string | undefined
}

export interface OverlayLocation {
  /** Absolute file path (server) or URL (client). Passed to `/__open-in-editor`. */
  file: string
  /** Root-relative path for display. */
  display: string
  line: number
  column?: number | undefined
}

export interface OverlayReport {
  kind: OverlayKind
  /** The route pattern that failed (`/blog/:slug`), else the request path. */
  route: string
  /** The request URL path, when it differs from `route`. */
  url?: string | undefined
  message: string
  /** Extra labelled facts shown under the message (hydration: server vs client values). */
  details?: Array<{ label: string; value: string }> | undefined
  location?: OverlayLocation | undefined
  frame?: CodeFrame | undefined
  fix?: OverlayFix | undefined
  stack: StackFrame[]
  /** One extra line under the actions, e.g. how many more mismatches were reported. */
  note?: string | undefined
}

/** Chip text per kind. */
export const KIND_TITLE: Record<OverlayKind, string> = {
  render: 'Server render failed',
  loader: 'Loader threw',
  middleware: 'Middleware threw',
  server: 'Server error',
  hydration: 'Hydration mismatch',
}

/** Phase label per kind, shown after the route. */
export const KIND_PHASE: Record<OverlayKind, string> = {
  render: 'SSR',
  loader: 'loader',
  middleware: 'middleware',
  server: 'SSR',
  hydration: 'client',
}

// ─── Stack ──────────────────────────────────────────────────────────────────

// V8: `    at fn (file:1:2)`, `    at async fn (file:1:2)`, `    at file:1:2`.
const V8_FRAME = /^\s*at (?:(?:async )?(.*?) \()?(.+?):(\d+):(\d+)\)?\s*$/
// SpiderMonkey / JavaScriptCore: `fn@file:1:2`, `@file:1:2`.
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/

export interface RawFrame {
  fn: string
  file: string
  line: number
  column: number
}

/**
 * Parse the frames out of an `Error.stack`. Lines that are not frames (the
 * message, which may span several lines, and `at native` style frames with no
 * position) are skipped.
 */
export function parseStack(stack: string | undefined): RawFrame[] {
  if (!stack) return []
  const out: RawFrame[] = []
  for (const line of stack.split('\n')) {
    const m = V8_FRAME.exec(line) ?? (line.includes('@') ? GECKO_FRAME.exec(line) : null)
    if (!m) continue
    const file = m[2] as string
    // `at new Promise (<anonymous>)` and similar carry no usable position.
    if (file === '<anonymous>' || file === 'native') continue
    out.push({
      fn: (m[1] ?? '').trim(),
      file,
      line: Number(m[3]),
      column: Number(m[4]),
    })
  }
  return out
}

export interface ClassifyOptions {
  /**
   * The app root. A filesystem path on the server (`/home/me/app`), or the
   * page origin in the browser (`http://localhost:5173`).
   */
  root: string
  /** Optional package-name lookup for library frames (the server reads package.json). */
  packageName?: ((file: string) => string | undefined) | undefined
}

/** Strip a URL down to its path, and drop Vite's `?v=` / `?t=` cache-busting query. */
function pathOf(file: string, root: string): string {
  let p = file
  if (p.startsWith('file://')) p = p.slice(7)
  if (root && p.startsWith(root)) p = p.slice(root.length)
  else if (/^https?:\/\//.test(p)) {
    try {
      p = new URL(p).pathname
    } catch {
      // keep as is
    }
  }
  const q = p.indexOf('?')
  return q === -1 ? p : p.slice(0, q)
}

/** `true` when a frame is framework or dependency code rather than the app's own. */
export function isLibraryFile(file: string, root: string): boolean {
  if (file.startsWith('node:') || file.startsWith('internal/')) return true
  if (file.includes('/node_modules/')) return true
  const isUrl = /^https?:\/\//.test(file)
  if (isUrl) {
    if (!file.startsWith(root)) return true
    const p = pathOf(file, root)
    // Vite serves files outside the root under /@fs/, virtual modules under
    // /@id/, and its own client under /@vite/.
    return p.startsWith('/@fs/') || p.startsWith('/@id/') || p.startsWith('/@vite/')
  }
  const plain = file.startsWith('file://') ? file.slice(7) : file
  // Only app code is printed relative (a hand-made or pre-mapped stack).
  if (!plain.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(plain)) return false
  const base = root.endsWith('/') ? root : `${root}/`
  return !plain.startsWith(base)
}

/** `@scope/name` or `name` from a path through `node_modules`, or Vite's `.vite/deps/@scope_name.js`. */
export function packageFromPath(file: string): string | undefined {
  const deps = /\/\.vite\/deps\/((?:@[^_/]+_)?[^/?]+?)\.js/.exec(file)
  if (deps) {
    const id = deps[1] as string
    return id.startsWith('@') ? id.replace('_', '/') : id
  }
  const i = file.lastIndexOf('/node_modules/')
  if (i === -1) return undefined
  const rest = file.slice(i + '/node_modules/'.length).split('/')
  if (rest[0]?.startsWith('@') && rest[1]) return `${rest[0]}/${rest[1]}`
  return rest[0] || undefined
}

function shortPath(file: string): string {
  const parts = file.split('?')[0]!.split('/').filter(Boolean)
  return parts.slice(-3).join('/')
}

/** Display path for an app file: relative to the root, no leading slash. */
export function displayPath(file: string, root: string): string {
  return pathOf(file, root).replace(/^\/+/, '')
}

/** Parse and classify a stack. */
export function classifyStack(stack: string | undefined, options: ClassifyOptions): StackFrame[] {
  return parseStack(stack).map((f) => {
    const library = isLibraryFile(f.file, options.root)
    let where: string
    if (library) {
      where = /^(?:node:|internal\/)/.test(f.file)
        ? f.file
        : (packageFromPath(f.file) ?? options.packageName?.(f.file) ?? shortPath(f.file))
    } else {
      where = `${displayPath(f.file, options.root)}:${f.line}:${f.column}`
    }
    return { fn: f.fn, file: f.file, line: f.line, column: f.column, library, where }
  })
}

/** The first frame in the app's own code — where the overlay points. */
export function firstAppFrame(frames: StackFrame[]): StackFrame | undefined {
  return frames.find((f) => !f.library && f.line !== undefined)
}

// ─── Code frame ─────────────────────────────────────────────────────────────

const TAB = '  '

/**
 * Lines around `line` (1-based) of `source`, with the failing line marked and
 * the caret column (1-based) adjusted for tab expansion. `undefined` when the
 * line is outside the file, which happens when a stale source map points past
 * the end after an edit.
 */
export function extractCodeFrame(
  source: string,
  line: number,
  column?: number | undefined,
  context: { before?: number; after?: number } = {},
): CodeFrame | undefined {
  const all = source.split(/\r?\n/)
  if (!Number.isInteger(line) || line < 1 || line > all.length) return undefined
  const before = context.before ?? 3
  const after = context.after ?? 2
  const start = Math.max(1, line - before)
  const end = Math.min(all.length, line + after)
  const lines: CodeFrameLine[] = []
  for (let n = start; n <= end; n++) {
    lines.push({ number: n, text: (all[n - 1] as string).replace(/\t/g, TAB), highlight: n === line })
  }
  let caret: number | undefined
  if (column !== undefined && Number.isInteger(column) && column >= 1) {
    const raw = all[line - 1] as string
    const head = raw.slice(0, column - 1)
    const tabs = head.split('\t').length - 1
    caret = Math.min(column + tabs * (TAB.length - 1), raw.replace(/\t/g, TAB).length + 1)
  }
  return { lines, caret }
}

// ─── Fix ────────────────────────────────────────────────────────────────────

/**
 * The "How to fix it" text from `@pyreon/compiler/diagnose`, the same catalog
 * the MCP `diagnose` tool and the dev console printer use. `undefined` when no
 * catalog entry matches: the overlay then shows no fix box rather than a
 * guess.
 */
export function findFix(message: string): OverlayFix | undefined {
  if (!message) return undefined
  let d: ReturnType<typeof diagnoseError>
  try {
    d = diagnoseError(message)
  } catch {
    return undefined
  }
  if (!d || !d.fix) return undefined
  return { cause: d.cause, fix: d.fix, ...(d.fixCode ? { fixCode: d.fixCode } : {}) }
}

// ─── Copy text ──────────────────────────────────────────────────────────────

/** Plain text for "Copy for your AI assistant": everything on the overlay, nothing more. */
export function formatCopyText(report: OverlayReport): string {
  const out: string[] = []
  out.push(`Pyreon dev error: ${KIND_TITLE[report.kind]}`)
  out.push(`Route: ${report.route} (${KIND_PHASE[report.kind]})`)
  if (report.url && report.url !== report.route) out.push(`URL: ${report.url}`)
  out.push('')
  out.push(report.message)
  if (report.details && report.details.length > 0) {
    out.push('')
    for (const d of report.details) out.push(`${d.label}: ${d.value}`)
  }
  if (report.location) {
    const loc = report.location
    out.push('')
    out.push(`File: ${loc.display}:${loc.line}${loc.column !== undefined ? `:${loc.column}` : ''}`)
  }
  if (report.frame) {
    const width = String(report.frame.lines[report.frame.lines.length - 1]?.number ?? 0).length
    out.push('')
    for (const l of report.frame.lines) {
      out.push(`${l.highlight ? '>' : ' '} ${String(l.number).padStart(width)} | ${l.text}`)
      if (l.highlight && report.frame.caret !== undefined) {
        out.push(`  ${' '.repeat(width)} | ${' '.repeat(report.frame.caret - 1)}^`)
      }
    }
  }
  if (report.fix) {
    out.push('')
    out.push(`How to fix it: ${report.fix.cause}`)
    out.push(report.fix.fix)
    if (report.fix.fixCode) out.push(report.fix.fixCode)
  }
  if (report.stack.length > 0) {
    out.push('')
    out.push('Stack:')
    for (const f of report.stack) {
      out.push(`  at ${f.fn || '<anonymous>'} (${f.where})${f.library ? ' [library]' : ''}`)
    }
  }
  if (report.note) {
    out.push('')
    out.push(report.note)
  }
  return out.join('\n')
}
