/**
 * Minimal LSP server for @pyreon/lint.
 *
 * Provides real-time Pyreon-specific feedback in editors that support the
 * Language Server Protocol (VS Code, Neovim, etc.).
 *
 * Usage: pyreon-lint --lsp
 *
 * Two surfaces:
 *
 * 1. **Diagnostics** — `@pyreon/lint` rule violations + Reactivity-Lens
 *    footguns (`props-destructured`, `signal-write-as-call`, …), published on
 *    open / change (debounced) / save.
 * 2. **Inlay hints** — the **Reactivity Lens**: subtle ghost-text at the end
 *    of each reactive / baked-once expression making Pyreon's "components run
 *    once; reactivity depends on WHERE you read a signal" model *visible at
 *    the cursor*. Each hint is a faithful record of a codegen decision the
 *    `@pyreon/compiler` already made — not a heuristic. Absence of a hint is
 *    "not asserted", never an implicit static claim.
 *
 * @module
 */

// `@pyreon/compiler` is a HEAVY graph (full JSX transform + oxc-parser +
// the TS compiler API via pyreon-intercept). A static value-import here
// would make EVERY importer of this module — including `cli.ts` and the
// package `index.ts` re-export — eagerly cold-load the entire compiler
// at module-eval (a CI `import('../cli')` hook timed out at 10s on
// exactly this). The Lens only needs it when hints are actually
// computed, so the value is lazy-loaded + memoized. The TYPE import is
// `import type` → fully erased at runtime, zero eager-load cost.
import type {
  analyzeReactivity as AnalyzeFn,
  firesToCreationSiteFindings as FiresToHintsFn,
  ReactivityFinding,
} from '@pyreon/compiler/analyze'
import { existsSync, statSync } from 'node:fs'
import nodePath from 'node:path'
import { SizedMap } from '@pyreon/sized-map'
import { AstCache } from '../cache'
import { locateConfig } from '../config/loader'
import { resolveLintConfig } from '../lint'
import { allRules } from '../rules/index'
import { _resetConfigDiagnosticsCache, fixEdits, lintFile, selectFixEdits } from '../runner'
import type { Diagnostic, Fix, LintConfig } from '../types'
import { LineIndex } from '../utils/source'

const cache = new AstCache()

/** Set by `_reloadConfig` — wins over the per-document config lookup. */
let configOverride: LintConfig | undefined

/**
 * Per-directory resolved config. The editor lints a document with the config
 * that governs ITS directory — the same nearest-`.pyreonlintrc.json` rule the
 * CLI uses — instead of a fixed preset: a server that ignored the project
 * config could neither show `readable` findings nor fix them on save.
 *
 * Bounded (LRU, one entry per directory with an open document) and validated
 * against the config file's mtime on every use, so an edit to
 * `.pyreonlintrc.json` takes effect on the next keystroke.
 */
const configByDir = new SizedMap<
  string,
  { path: string | null; mtimeMs: number; config: LintConfig }
>({ maxEntries: 64, lru: true })

function mtimeOf(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return -1
  }
}

/** @internal — exported for tests. The config the server lints `filePath` with. */
export function _configFor(filePath: string): LintConfig {
  if (configOverride) return configOverride
  const dir = nodePath.dirname(filePath)
  const hit = configByDir.get(dir)
  if (hit && (hit.path === null || mtimeOf(hit.path) === hit.mtimeMs)) return hit.config
  let located: ReturnType<typeof locateConfig> = null
  try {
    located = locateConfig(dir)
  } catch {
    located = null
  }
  let config: LintConfig
  try {
    config = resolveLintConfig(located?.config ?? null)
  } catch {
    // An invalid preset name: lint with the default rather than not at all.
    config = resolveLintConfig(null)
  }
  if (hit) _resetConfigDiagnosticsCache()
  configByDir.set(dir, {
    path: located?.path ?? null,
    mtimeMs: located ? mtimeOf(located.path) : 0,
    config,
  })
  return config
}

/**
 * Pin the LSP's lint config, bypassing the per-document lookup (tests, and a
 * future `workspace/didChangeConfiguration` hookup). Resets the runner's
 * per-process validation cache so newly-configured options are re-validated
 * against rule schemas on the next lint pass. Pass `undefined` to go back to
 * reading each document's `.pyreonlintrc.json`.
 */
export function _reloadConfig(next: LintConfig | undefined): void {
  configOverride = next
  configByDir.clear()
  _resetConfigDiagnosticsCache()
  cache.clear()
}

// ─── JSON-RPC message types ────────────────────────────────────────────────

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string | undefined
  method?: string | undefined
  params?: any
  result?: any
}

// ─── LSP shapes ────────────────────────────────────────────────────────────

interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
  severity: number
  source: string
  message: string
  code: string
}

interface LspInlayHint {
  position: { line: number; character: number }
  label: string
  /** Tooltip (markdown) shown on hover. */
  tooltip?: string
  /** Render a leading space so the hint doesn't jam against the code. */
  paddingLeft?: boolean
}

interface LspPosition {
  line: number
  character: number
}

interface LspRange {
  start: LspPosition
  end: LspPosition
}

/**
 * Offset → LSP position (0-based line, 0-based UTF-16 character — which is
 * exactly a JS string index within the line).
 *
 * The previous conversion took `loc.column - 1` as if the column were 1-based;
 * `LineIndex` columns are 0-based, so every diagnostic started one character
 * early (at `-1` for a finding in column 0), and the end was computed as
 * "start + span length" on the START line, which is wrong for any span that
 * crosses a line. Code actions need exact ranges, so both are derived from
 * offsets now.
 */
function toPosition(index: LineIndex, offset: number): LspPosition {
  const loc = index.locate(offset)
  return { line: loc.line - 1, character: loc.column }
}

function toRange(index: LineIndex, start: number, end: number): LspRange {
  return { start: toPosition(index, start), end: toPosition(index, end) }
}

function toLspDiagnostic(d: Diagnostic, index: LineIndex): LspDiagnostic {
  return {
    range: toRange(index, d.span.start, d.span.end),
    severity: d.severity === 'error' ? 1 : d.severity === 'warn' ? 2 : 3,
    source: 'pyreon-lint',
    message: d.message,
    code: d.ruleId,
  }
}

/** @internal — exported for tests. */
export function _toLspDiagnostics(diagnostics: Diagnostic[], text: string): LspDiagnostic[] {
  const index = new LineIndex(text)
  return diagnostics.map((d) => toLspDiagnostic(d, index))
}

// ─── Reactivity Lens surface ───────────────────────────────────────────────

/** Short ghost-text badge per structural kind. */
const HINT_LABEL: Record<string, string> = {
  reactive: 'live',
  'reactive-prop': 'live·prop',
  'reactive-attr': 'live·attr',
  'static-text': 'static',
  'hoisted-static': 'hoisted',
}

/**
 * Compute the Reactivity-Lens surface for a document. Pure +
 * deterministic + side-effect-free — the unit-testable core of the LSP's
 * lens feature (the JSON-RPC transport is a thin wrapper).
 *
 * @returns `inlayHints` — structural reactivity facts as end-of-span ghost
 *          text; `footgunDiagnostics` — detected anti-patterns as
 *          warning-severity diagnostics (source `pyreon-lens`).
 */
let _analyze: typeof AnalyzeFn | undefined
async function loadAnalyze(): Promise<typeof AnalyzeFn> {
  if (!_analyze) _analyze = (await import('@pyreon/compiler/analyze')).analyzeReactivity
  return _analyze
}

/**
 * Live Program Inlay Hints (LPIH) — optional runtime fire-count cache.
 *
 * **Discovery** (in priority order):
 *   1. `PYREON_LPIH_CACHE` env var — explicit override
 *   2. Walk up from the file being linted to the nearest `package.json`
 *      and check for `<root>/.pyreon-lpih.json` (zero-config default —
 *      matches what `@pyreon/reactivity/lpih`'s `startLpihPolling()`
 *      writes when called with no path)
 *
 * Each `textDocument/inlayHint` request re-reads the discovered file.
 * The runtime side (`@pyreon/reactivity`'s `getFireSummaries()`) is
 * written to the file by a bridge (`startLpihPolling()` from
 * `@pyreon/reactivity/lpih`, the devtools extension, or a test harness).
 * Each fire datum becomes a creation-site inlay hint at the source line
 * where `signal()` / `computed()` / `effect()` was called.
 *
 * Shape on disk:
 *   { fires: [{ file, line, count, kind?, lastFire? }, ...] }
 *
 * Read errors (file missing, malformed JSON) are silent — LPIH degrades
 * gracefully to the static Reactivity-Lens hints only.
 */
let _lpihLoaders:
  | {
      firesToHints: typeof FiresToHintsFn
    }
  | undefined

async function loadLpih(): Promise<NonNullable<typeof _lpihLoaders>> {
  if (!_lpihLoaders) {
    const m = await import('@pyreon/compiler/analyze')
    _lpihLoaders = { firesToHints: m.firesToCreationSiteFindings }
  }
  return _lpihLoaders
}

/** @internal — exported for the unit-testable roundtrip. */
export interface LPIHCacheEntry {
  file: string
  line: number
  count: number
  kind?: 'signal' | 'derived' | 'effect'
  lastFire?: number | null
  /** EWMA fire rate (fires/sec). 0 when dormant. See FireSummary.rate1s. */
  rate1s?: number
}

/** @internal — readable shape of the LPIH cache file. */
export interface LPIHCacheFile {
  fires: LPIHCacheEntry[]
}

/**
 * Default cache filename — must match `@pyreon/reactivity/lpih`'s
 * `LPIH_DEFAULT_FILENAME`. Decoupled (no import) to keep `@pyreon/lint`
 * from taking a `@pyreon/reactivity` dependency — but a drift gate test
 * locks them at the same value (see `lsp-lpih.test.ts`).
 *
 * @internal — exported for tests.
 */
export const _LPIH_DEFAULT_FILENAME = '.pyreon-lpih.json'

/**
 * Per-file → project-root memoization cache. Walking up the filesystem
 * to find `package.json` is cheap (sync stat × max ~10 levels) but
 * happens on every inlay-hint request, so caching by file path makes
 * the typical "edit one file repeatedly" workflow allocation-free after
 * the first hit. Bounded growth: one entry per open document, cleared
 * by `_resetOpenDocuments()` along with the document map.
 *
 * @internal
 */
const _projectRootCache = new Map<string, string | null>()

/** @internal — exported for tests. */
export function _resetProjectRootCache(): void {
  _projectRootCache.clear()
}

/**
 * Walk up from `filePath` to find the nearest `package.json`. Returns
 * the directory containing it (the project root), or null if no
 * `package.json` is found within `maxDepth` levels.
 *
 * Cached per `filePath` for the lifetime of the LSP process. The cache
 * stores nulls too — repeated misses don't re-walk.
 *
 * Sync `existsSync` is used deliberately: the walk is <10 stat calls
 * in 99% of cases, comparable to a single `readFile` in cost, and
 * async would force every consumer of `_resolveLpihCachePath` to
 * also become async. The hint hot-path is already async (LSP message
 * handler awaits `_readLpihCache`); adding another async hop here
 * adds latency without changing the worst-case wall-clock.
 *
 * @internal — exported for tests.
 */
export function _findProjectRoot(filePath: string, maxDepth = 32): string | null {
  if (_projectRootCache.has(filePath)) {
    return _projectRootCache.get(filePath) ?? null
  }
  // Statically imported, not `require`d. This package is `"type": "module"`
  // and builds to ESM, so a `require` here throws `require is not defined`
  // under Node — and because the callers wrap it in try/catch, it does not
  // crash, it silently returns the fallback. Bun defines `require` in ESM,
  // which is why every test passed. `node:fs`/`node:path` are native
  // bindings; there is nothing to lazy-load.
  let dir = nodePath.dirname(filePath)
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(nodePath.join(dir, 'package.json'))) {
      _projectRootCache.set(filePath, dir)
      return dir
    }
    const parent = nodePath.dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  _projectRootCache.set(filePath, null)
  return null
}

/**
 * Resolve the LPIH cache path for a given source file. Priority:
 *   1. `PYREON_LPIH_CACHE` env var (explicit override)
 *   2. `<project-root>/.pyreon-lpih.json` if `package.json` is found
 *   3. undefined — LPIH path is inactive
 *
 * @internal — exported for tests.
 */
export function _resolveLpihCachePath(filePath: string): string | undefined {
  const envPath = process.env.PYREON_LPIH_CACHE
  if (envPath) return envPath
  const root = _findProjectRoot(filePath)
  if (!root) return undefined
  return nodePath.join(root, _LPIH_DEFAULT_FILENAME)
}

/**
 * Hard cap on cache file size. A well-formed cache for a typical app is
 * <100 KB (one entry per signal/computed/effect, ~80 bytes each, real
 * apps have <1000 reactive primitives). 1 MB is ~10× headroom for the
 * largest realistic app. Larger files are treated as malformed —
 * prevents pathological cases (corrupted cache, malicious file, or
 * a bug-generated runaway append) from blocking the LSP on a giant read.
 *
 * @internal — exported for tests + tunability.
 */
export const _LPIH_CACHE_MAX_BYTES = 1024 * 1024

/**
 * Hide hints whose fire data is older than this. If the user killed
 * the dev server but the cache file remains, the LSP would otherwise
 * keep showing yesterday's fire counts as if they were live. After
 * this threshold elapses since the latest `lastFire`, we suppress the
 * hints — silence is more honest than stale data.
 *
 * 5 minutes balances: short enough to clear quickly after dev session
 * ends; long enough to survive normal idle periods (deep work, breaks).
 *
 * @internal — exported for tests + tunability.
 */
export const _LPIH_STALE_AFTER_MS = 5 * 60 * 1000

/**
 * Single prefix-rewrite rule for `_applyLpihPathMap`. The `from` prefix
 * is matched against the start of the file path; if it matches, the
 * prefix is replaced with `to`.
 *
 * @internal — exported for tests.
 */
export interface LPIHPathMapEntry {
  from: string
  to: string
}

/**
 * Parse `PYREON_LPIH_PATH_MAP` env-var format: `from1=to1;from2=to2`.
 *
 * Use case: in remote-dev environments (Codespaces, devcontainers,
 * Docker dev), the runtime captures paths from one filesystem view
 * (e.g. `/host/proj/...`) while the LSP serves files from another
 * (e.g. `/workspaces/proj/...`). Without rewriting, fire-data paths
 * never match the LSP source-file path and inlay hints stay invisible.
 *
 * Example:
 *   PYREON_LPIH_PATH_MAP=/host/proj=/workspaces/proj
 *
 * Multiple mappings via `;`:
 *   PYREON_LPIH_PATH_MAP=/host=/workspaces;/build=/dev
 *
 * Malformed entries (missing `=`) are silently dropped — env vars are
 * a fragile transport, and a typo shouldn't break LPIH wholesale.
 *
 * @internal — exported for tests.
 */
export function _parseLpihPathMap(envValue: string | undefined): LPIHPathMapEntry[] {
  if (!envValue) return []
  const out: LPIHPathMapEntry[] = []
  for (const pair of envValue.split(';')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue // malformed — drop silently
    const from = trimmed.slice(0, eqIdx)
    const to = trimmed.slice(eqIdx + 1)
    // Allow empty `to` (strips prefix) but require non-empty `from`.
    if (from.length === 0) continue
    out.push({ from, to })
  }
  // Sort by longest `from` first — ensures `/host/proj` wins over
  // `/host` when both are present (otherwise the shorter prefix would
  // match first and produce wrong rewrites).
  return out.sort((a, b) => b.from.length - a.from.length)
}

/**
 * Apply path map to a single file string. Returns the rewritten path,
 * or the input unchanged if no rule matched. First-match wins (which
 * is the LONGEST match thanks to `_parseLpihPathMap`'s sort).
 *
 * @internal — exported for tests.
 */
export function _applyLpihPathMap(file: string, map: readonly LPIHPathMapEntry[]): string {
  for (const { from, to } of map) {
    if (file.startsWith(from)) return to + file.slice(from.length)
  }
  return file
}

/**
 * Read + parse the LPIH cache file. Returns [] on any error
 * (file missing, JSON malformed, shape unexpected, file too large).
 * Silent failure is the right call — the cache is opportunistic
 * enrichment, not a load-bearing dependency.
 *
 * Defensive limits:
 *  - File size capped at `_LPIH_CACHE_MAX_BYTES` (1 MB); larger files
 *    are rejected wholesale rather than parsed.
 *  - Stale entries (where `lastFire` is older than
 *    `_LPIH_STALE_AFTER_MS`) are filtered out so a dev-server-killed
 *    stale cache stops showing yesterday's counts.
 *
 * Path remapping: when `PYREON_LPIH_PATH_MAP` is set, each entry's
 * `file` field is rewritten via `_applyLpihPathMap`. Useful for
 * remote-dev environments where runtime + editor see different
 * filesystem roots (Codespaces, devcontainers, Docker dev).
 *
 * @internal — exported for tests.
 */
export async function _readLpihCache(
  path: string | undefined,
  /** Override "now" for deterministic stale-filter tests. */
  now: () => number = () => Date.now(),
  /** Override path-map source for tests (default: PYREON_LPIH_PATH_MAP env). */
  pathMapSource: string | undefined = process.env.PYREON_LPIH_PATH_MAP,
): Promise<LPIHCacheEntry[]> {
  if (!path) return []
  let handle: Awaited<ReturnType<typeof import('node:fs/promises').open>> | null = null
  try {
    const fs = await import('node:fs/promises')
    // TOCTOU-free: open ONCE, then do stat + read against the SAME file
    // descriptor. With a single descriptor, fstat and read both operate
    // on the SAME inode regardless of what happens to the path on disk
    // between calls (atomic-rename swap, deletion, etc.). The prior
    // shape (separate fs.stat(path) + fs.readFile(path)) had a race
    // CodeQL flagged as `js/file-system-race`.
    handle = await fs.open(path, 'r')
    const stat = await handle.stat()
    // Bail before reading if the file is implausibly large.
    if (stat.size > _LPIH_CACHE_MAX_BYTES) return []
    // Stale-data filter. `lastFire` is `performance.now()` which is
    // process-relative — comparing to Date.now() would be wrong. Instead
    // we approximate "stale" by checking the FILE's mtime: if the cache
    // file hasn't been re-written in `_LPIH_STALE_AFTER_MS`, the dev
    // server is silent and the data should be treated as historical.
    const fileAgeMs = now() - stat.mtimeMs
    if (fileAgeMs > _LPIH_STALE_AFTER_MS) return []
    // Read from the descriptor — the file the bytes came from is
    // identical to the file we statted (same inode, no race).
    const raw = await handle.readFile('utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { fires?: unknown }).fires)
    ) {
      return []
    }
    const fires = (parsed as { fires: unknown[] }).fires.filter(
      (f): f is LPIHCacheEntry =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as LPIHCacheEntry).file === 'string' &&
        typeof (f as LPIHCacheEntry).line === 'number' &&
        typeof (f as LPIHCacheEntry).count === 'number',
    )
    // Apply optional path-map rewrites — runtime-captured paths may
    // differ from LSP-served paths in remote-dev (Codespaces, etc).
    const pathMap = _parseLpihPathMap(pathMapSource)
    if (pathMap.length === 0) return fires
    return fires.map((f) => ({ ...f, file: _applyLpihPathMap(f.file, pathMap) }))
  } catch {
    return []
  } finally {
    if (handle) {
      try {
        await handle.close()
      } catch {
        /* close failures are rare + harmless — Node's per-process FD
           limit ÷ LSP inlay-hint frequency is essentially infinity */
      }
    }
  }
}

/**
 * Convert a `file://` URI to an OS-native filesystem path. Handles the
 * Windows trap where `file:///C:/path` → `/C:/path` would be wrong
 * (correct: `C:\path` or `C:/path` depending on platform).
 *
 * Falls back to a simple `replace('file://', '')` if `URL.fileURLToPath`
 * isn't available (very old environments).
 *
 * @internal — exported for tests.
 */
export function _uriToFilePath(uri: string): string {
  if (!uri.startsWith('file://')) return uri
  try {
    // node:url's fileURLToPath handles Windows + percent-encoding correctly.
    // Available in Bun + every Node version Pyreon supports. (This used to
    // claim a `require()` bridge was needed for CJS hosts; the code below
    // uses neither, and the package ships ESM, so a CJS host has to
    // `import()` it regardless.)
    const decoded = decodeURIComponent(new URL(uri).pathname)
    return decoded.replace(/^\/([A-Za-z]:)/, '$1')
  } catch {
    return uri.replace('file://', '')
  }
}

export async function computeReactivityHints(
  filePath: string,
  text: string,
  options: { liveFires?: readonly LPIHCacheEntry[] } = {},
): Promise<{ inlayHints: LspInlayHint[]; footgunDiagnostics: LspDiagnostic[] }> {
  let findings: ReactivityFinding[]
  try {
    const analyzeReactivity = await loadAnalyze()
    findings = analyzeReactivity(text, filePath).findings
  } catch {
    findings = []
  }

  const inlayHints: LspInlayHint[] = []
  const footgunDiagnostics: LspDiagnostic[] = []

  // ── LPIH: synthesize creation-site hints from runtime fire data ──────
  // These are LIVE inlay hints (label: "🔥 N×") at the line where the
  // signal/computed/effect was created. Different from the static spans
  // below (which sit at reactive READ sites in JSX).
  if (options.liveFires && options.liveFires.length > 0) {
    try {
      const { firesToHints } = await loadLpih()
      const liveFindings = firesToHints(options.liveFires, filePath)
      for (const f of liveFindings) {
        inlayHints.push({
          position: { line: f.line - 1, character: 0 },
          label: `🔥 ${f.detail}`,
          tooltip: `Runtime: ${f.detail}`,
          paddingLeft: true,
        })
      }
    } catch {
      // LPIH is opportunistic — degrade silently to static hints only.
    }
  }

  for (const f of findings) {
    if (f.kind === 'footgun') {
      footgunDiagnostics.push({
        range: {
          start: { line: f.line - 1, character: f.column },
          end: { line: f.endLine - 1, character: f.endColumn },
        },
        severity: 2, // warning
        source: 'pyreon-lens',
        message: f.detail,
        code: f.code ?? 'reactivity-footgun',
      })
      continue
    }
    const label = HINT_LABEL[f.kind]
    if (!label) continue
    // Anchor the ghost text at the END of the span so it reads
    // `{count()} live`. LSP positions are 0-based line + 0-based char.
    inlayHints.push({
      position: { line: f.endLine - 1, character: f.endColumn },
      label,
      tooltip: f.detail,
      paddingLeft: true,
    })
  }

  return { inlayHints, footgunDiagnostics }
}

// ─── Lint a document ───────────────────────────────────────────────────────

async function lintDocument(uri: string, text: string): Promise<LspDiagnostic[]> {
  const filePath = _uriToFilePath(uri)
  let lintDiags: LspDiagnostic[] = []
  try {
    const result = lintFile(filePath, text, allRules, _configFor(filePath), cache)
    lintDiags = _toLspDiagnostics(result.diagnostics, text)
  } catch {
    // Parse errors, unsupported file types — no lint diagnostics. The
    // Reactivity-Lens layer is computed independently below (it has its
    // own try/catch and TS-API parse).
  }
  const { footgunDiagnostics } = await computeReactivityHints(filePath, text)
  return [...lintDiags, ...footgunDiagnostics]
}

/** Lint + publish; fire-and-forget from notification handlers. */
function publishDiagnostics(uri: string, text: string): void {
  void lintDocument(uri, text).then((diagnostics) =>
    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics }),
  )
}

// ─── Debounce ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 150
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function debounceLint(uri: string, text: string): void {
  const existing = debounceTimers.get(uri)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    uri,
    setTimeout(() => {
      debounceTimers.delete(uri)
      publishDiagnostics(uri, text)
    }, DEBOUNCE_MS),
  )
}

// ─── Code actions ──────────────────────────────────────────────────────────

/** The kind VS Code's `editor.codeActionsOnSave` asks for: `{ "source.fixAll.pyreon": "explicit" }`. */
export const FIX_ALL_KIND = 'source.fixAll.pyreon'

interface LspTextEdit {
  range: LspRange
  newText: string
}

interface LspCodeAction {
  title: string
  kind: string
  diagnostics?: LspDiagnostic[]
  isPreferred?: boolean
  edit: { changes: Record<string, LspTextEdit[]> }
}

/** LSP kinds are hierarchical: a request for `source.fixAll` matches `source.fixAll.pyreon`. */
function kindRequested(kind: string, only: readonly string[] | undefined): boolean {
  if (!only || only.length === 0) return true
  return only.some((o) => kind === o || kind.startsWith(`${o}.`))
}

function toTextEdits(edits: readonly Fix[], index: LineIndex): LspTextEdit[] {
  return edits.map((e) => ({ range: toRange(index, e.span.start, e.span.end), newText: e.replacement }))
}

/**
 * Code actions for a document: one `quickfix` per fixable finding in the
 * requested range, a "fix all of this rule" action when a rule has several,
 * and a `source.fixAll.pyreon` action that applies every non-overlapping fix
 * in the document — the action `codeActionsOnSave` runs.
 *
 * Pure (given the document text); the JSON-RPC handler is a thin wrapper.
 *
 * @internal — exported for tests.
 */
export function _computeCodeActions(
  uri: string,
  text: string,
  range: LspRange | undefined,
  only: readonly string[] | undefined,
): LspCodeAction[] {
  const filePath = _uriToFilePath(uri)
  let diagnostics: Diagnostic[]
  try {
    diagnostics = lintFile(filePath, text, allRules, _configFor(filePath), cache).diagnostics
  } catch {
    return []
  }
  const fixable = diagnostics.filter((d) => d.fix)
  if (fixable.length === 0) return []
  const index = new LineIndex(text)
  const actions: LspCodeAction[] = []

  if (kindRequested('quickfix', only)) {
    const byRule = new Map<string, Diagnostic[]>()
    for (const d of fixable) byRule.set(d.ruleId, [...(byRule.get(d.ruleId) ?? []), d])

    for (const d of fixable) {
      const lsp = toLspDiagnostic(d, index)
      if (range && (lsp.range.end.line < range.start.line || lsp.range.start.line > range.end.line)) {
        continue
      }
      actions.push({
        title: `Fix: ${d.message.split('. ')[0]?.replace(/\.$/, '') ?? d.ruleId} (${d.ruleId})`,
        kind: 'quickfix',
        diagnostics: [lsp],
        isPreferred: true,
        edit: { changes: { [uri]: toTextEdits(fixEdits(d.fix!), index) } },
      })
      const sameRule = byRule.get(d.ruleId) ?? []
      if (sameRule.length > 1) {
        actions.push({
          title: `Fix all ${d.ruleId} problems in this file`,
          kind: 'quickfix',
          edit: { changes: { [uri]: toTextEdits(selectFixEdits(sameRule), index) } },
        })
        byRule.set(d.ruleId, []) // offer the rule-wide action once
      }
    }
  }

  if (kindRequested(FIX_ALL_KIND, only)) {
    actions.push({
      title: 'Fix all auto-fixable Pyreon lint problems',
      kind: FIX_ALL_KIND,
      edit: { changes: { [uri]: toTextEdits(selectFixEdits(diagnostics), index) } },
    })
  }
  return actions
}

// ─── Message handling ──────────────────────────────────────────────────────

const openDocuments = new Map<string, string>()

/**
 * Pure message handler. Exported (underscore-prefixed, matching the
 * codebase's `_reloadConfig` internal-export convention) so the JSON-RPC
 * contract — including the `textDocument/inlayHint` round-trip — is
 * unit-testable without spawning the stdio transport.
 */
export function _handleMessage(
  msg: JsonRpcMessage,
): JsonRpcMessage | null | Promise<JsonRpcMessage | null> {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1, // Full sync
          diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
          inlayHintProvider: true,
          codeActionProvider: { codeActionKinds: ['quickfix', FIX_ALL_KIND] },
        },
        serverInfo: { name: 'pyreon-lint', version: '0.11.5' },
      },
    }
  }

  if (msg.method === 'initialized') {
    return null // no response needed
  }

  if (msg.method === 'textDocument/didOpen') {
    const { uri, text } = msg.params.textDocument
    openDocuments.set(uri, text)
    publishDiagnostics(uri, text)
    return null
  }

  if (msg.method === 'textDocument/didChange') {
    const uri = msg.params.textDocument.uri
    const text = msg.params.contentChanges[0]?.text
    if (text != null) {
      openDocuments.set(uri, text)
      // Debounce: wait 150ms after last keystroke before linting
      debounceLint(uri, text)
    }
    return null
  }

  if (msg.method === 'textDocument/didSave') {
    const uri = msg.params.textDocument.uri
    const text = openDocuments.get(uri)
    if (text) publishDiagnostics(uri, text)
    return null
  }

  if (msg.method === 'textDocument/inlayHint') {
    const uri: string = msg.params.textDocument.uri
    const text = openDocuments.get(uri)
    if (text == null) {
      return { jsonrpc: '2.0', id: msg.id, result: [] }
    }
    const filePath = _uriToFilePath(uri)
    // LPIH cache file is configured via env var (explicit override) OR
    // auto-discovered as <project-root>/.pyreon-lpih.json — matches
    // what @pyreon/reactivity/lpih's startLpihPolling() writes by default.
    // Re-read on every request so live-edit + dev-server roundtrips
    // reflect immediately; the per-file project-root lookup is memoized.
    const cachePath = _resolveLpihCachePath(filePath)
    return _readLpihCache(cachePath).then(async (fires) => {
      const { inlayHints } = await computeReactivityHints(
        filePath,
        text,
        fires.length ? { liveFires: fires } : {},
      )
      // Honor the requested visible range if the client sent one (large
      // files send a window; the editor re-requests on scroll).
      const range = msg.params.range as
        | { start: { line: number }; end: { line: number } }
        | undefined
      const hints = range
        ? inlayHints.filter(
            (h) =>
              h.position.line >= range.start.line && h.position.line <= range.end.line,
          )
        : inlayHints
      return { jsonrpc: '2.0', id: msg.id, result: hints }
    })
  }

  if (msg.method === 'textDocument/codeAction') {
    const uri: string = msg.params.textDocument.uri
    const text = openDocuments.get(uri)
    if (text == null) return { jsonrpc: '2.0', id: msg.id, result: [] }
    const actions = _computeCodeActions(uri, text, msg.params.range, msg.params.context?.only)
    return { jsonrpc: '2.0', id: msg.id, result: actions }
  }

  if (msg.method === 'textDocument/didClose') {
    const uri = msg.params.textDocument.uri
    openDocuments.delete(uri)
    sendNotification('textDocument/publishDiagnostics', { uri, diagnostics: [] })
    return null
  }

  if (msg.method === 'shutdown') {
    return { jsonrpc: '2.0', id: msg.id, result: null }
  }

  if (msg.method === 'exit') {
    process.exit(0)
  }

  // Unknown method
  if (msg.id != null) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: null,
    }
  }

  return null
}

/** Test-only: reset the open-document map between integration specs. */
export function _resetOpenDocuments(): void {
  openDocuments.clear()
  _projectRootCache.clear()
  configByDir.clear()
}

// ─── JSON-RPC transport (stdin/stdout) ─────────────────────────────────────

function sendMessage(msg: JsonRpcMessage) {
  const body = JSON.stringify(msg)
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`
  process.stdout.write(header + body)
}

function sendNotification(method: string, params: any) {
  sendMessage({ jsonrpc: '2.0', method, params })
}

/**
 * Start the LSP server. Reads JSON-RPC messages from stdin,
 * processes them, and writes responses to stdout.
 */
export function startLspServer(): void {
  let buffer = ''

  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk

    // Parse Content-Length header + body
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const header = buffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        buffer = buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = Number.parseInt(match[1]!, 10)
      const bodyStart = headerEnd + 4
      if (buffer.length < bodyStart + contentLength) break

      const body = buffer.slice(bodyStart, bodyStart + contentLength)
      buffer = buffer.slice(bodyStart + contentLength)

      try {
        const msg = JSON.parse(body) as JsonRpcMessage
        const response = _handleMessage(msg)
        if (response) {
          Promise.resolve(response).then((r) => {
            if (r) sendMessage(r)
          })
        }
      } catch {
        // malformed JSON — ignore
      }
    }
  })

  process.stderr.write('[pyreon-lint] LSP server started\n')
}
