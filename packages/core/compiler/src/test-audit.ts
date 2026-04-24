/**
 * Test-environment audit for the `audit_test_environment` MCP tool (T2.5.7).
 *
 * Scans `*.test.ts` / `*.test.tsx` files under the `packages` tree
 * for **mock-vnode patterns** — tests that construct `{ type, props,
 * children }` object literals (or a custom `vnode(...)` helper) in
 * place of going through the real `h()` from `@pyreon/core`. This
 * class of pattern silently drops rocketstyle / compiler / attrs
 * work from the pipeline, letting bugs through that production
 * would hit immediately (see PR #197 silent metadata drop).
 *
 * The scanner does NOT run the tests or parse TypeScript — a fast
 * regex pass is intentional. Accuracy trades for speed: the false-
 * positive rate is low because the `{ type: ..., props: ...,
 * children: ... }` shape is unusual outside of vnode construction.
 *
 * Output classification:
 *   HIGH   — mock patterns present, no real `h()` calls and no `h`
 *            import from `@pyreon/core`. Most at risk: the file has
 *            no pathway to exercise the real pipeline.
 *   MEDIUM — mock patterns present, some real `h()` usage — but the
 *            mock count is still notable, so a parallel real-`h()`
 *            test may be missing for specific scenarios.
 *   LOW    — either no mocks, or mock count is dwarfed by real usage.
 *
 * Companion to the `validate` and `get_anti_patterns` tools: those
 * tell an agent what to write; this one tells an agent which existing
 * tests need strengthening.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export type AuditRisk = 'high' | 'medium' | 'low'

export interface TestAuditEntry {
  /** Absolute path to the test file */
  path: string
  /** Path relative to the repo root for readable reporting */
  relPath: string
  /** Count of object-literal `{ type: ..., props: ..., children: ... }` patterns */
  mockVNodeLiteralCount: number
  /** Count of `vnode` / `mockVNode` / `createVNode` helper DEFINITIONS */
  mockHelperCount: number
  /**
   * Count of CALLS to a known mock-helper name. Captures pervasiveness:
   * a file with one helper definition and 50 call-sites has the same
   * `mockHelperCount` (1) as one with zero calls, but very different
   * exposure. This metric surfaces that.
   */
  mockHelperCallCount: number
  /** Count of lines that look like real `h(...)` calls (`h(Tag, props)` / `h(Component, ...)` shape) */
  realHCallCount: number
  /** True if the file imports `h` from `@pyreon/core` */
  importsH: boolean
  /** Risk classification */
  risk: AuditRisk
}

export interface TestAuditResult {
  /** Repo root discovered by walking up for `packages/` */
  root: string | null
  /** Every test file scanned, sorted by risk (high → low) then path */
  entries: TestAuditEntry[]
  /** Total files scanned */
  totalScanned: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // fall through to parent walk
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function walkTestFiles(dir: string, out: string[], depth = 0): void {
  if (depth > 10) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules' || name === 'lib' || name === 'dist') continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      walkTestFiles(full, out, depth + 1)
      continue
    }
    if (/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pattern detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Matches an object literal carrying `type`, `props`, AND `children`
 * keys — the canonical mock-vnode shape. The `s` flag spans newlines
 * because vnode literals often wrap across multiple lines.
 */
const MOCK_VNODE_LITERAL_PATTERN =
  /\{\s*type\s*:[^{}]*?(?:(?:\{[^{}]*\})[^{}]*?)*?props\s*:[^{}]*?(?:(?:\{[^{}]*\})[^{}]*?)*?children\s*:[^{}]*?(?:(?:\{[^{}]*\})[^{}]*?)*?\}/gs

/**
 * Matches a helper definition that produces a mock vnode. Recognises:
 *   const vnode = (...) => ({ type, props, children })
 *   const mockVNode = ({ type, props, children })
 *   function createVNode(type, props, children)
 *
 * Does NOT match bindings that merely STORE a real VNode with a
 * `vnode`-like name, which are common in component tests:
 *   const vnode = defaultRender(...)         // real render result
 *   const vnode = <span>cell content</span>  // real JSX expression
 *   const vnode = h('div', null, 'x')        // real h() call
 *
 * Distinguisher: a mock helper definition either
 *   (a) starts an arrow function / function — RHS begins with `(` or the
 *       keyword `function`, OR
 *   (b) is itself an inline object literal — RHS begins with `{`.
 * `const vnode = <anything else>` is a binding, not a definition.
 */
const MOCK_HELPER_PATTERN =
  /(?:(?:const|let)\s+(?:mockV[Nn]ode|vnode|createV[Nn]ode|V[Nn]odeMock|makeV[Nn]ode)\s*=\s*(?:\(|\{|function\b|async\s))|(?:function\s+(?:mockV[Nn]ode|vnode|createV[Nn]ode|V[Nn]odeMock|makeV[Nn]ode)\s*\()/g

/**
 * Matches CALLS to a known mock-helper name:
 *   vnode('div', props, children)
 *   mockVNode(Component, props)
 *   createVNode(...)
 *
 * Non-word boundary before the name avoids hits inside other
 * identifiers (`hasVNode`, `myVnodeImpl`). The helper-def pattern
 * above ALSO matches definitions' own `<name>(` arg list, so the
 * caller should subtract definition count from call count to get
 * usage-only density — but for risk classification, the combined
 * signal (any mock-helper activity) is what we want.
 */
const MOCK_HELPER_CALL_PATTERN =
  /(?:^|[^a-zA-Z0-9_])(?:mockV[Nn]ode|vnode|createV[Nn]ode|V[Nn]odeMock|makeV[Nn]ode)\s*\(/g

/**
 * Matches calls to `h(…)` where the first arg is an uppercase
 * identifier (component) or a lowercase string tag — the two real
 * shapes. Avoids matching:
 *   hasSomething(...)   — h followed by [a-z]
 *   ch()                — single h as substring of another name
 *   hash()              — same
 * The `(?:^|\W)` boundary plus `[A-Z'"\s]` arg requirement handles both.
 */
const REAL_H_CALL_PATTERN = /(?:^|\W)h\s*\(\s*["'A-Z]/g

const IMPORT_H_PATTERN = /import\s*(?:type\s*)?\{[^}]*\bh\b[^}]*\}\s*from\s*['"]@pyreon\/core['"]/

/**
 * Predicate: does the `{type, props, children}` literal at this
 * position appear as an argument to a type-guard-like call
 * (`isDocNode(...)`, `hasVNode(...)`, `assertVNode(...)`, etc.)?
 *
 * Type guards take any object shape and return boolean — passing a
 * `{type, props, children}` literal there is testing the guard's
 * duck-typing, not building a mock vnode for a rendering pipeline.
 * False-positive coverage for `utils-coverage.test.ts` and similar.
 */
function isLiteralInsideTypeGuardCall(source: string, literalStart: number): boolean {
  // Scan back ~60 chars from the literal for `(\b(?:is|has|assert|validate|check)[A-Z]\w*\s*\()`.
  // We're looking for a function-call opening paren that directly
  // contains this literal (no closer `)` in between).
  const window = source.slice(Math.max(0, literalStart - 60), literalStart)
  // The nearest `(` before the literal — count unmatched parens.
  let unmatched = 0
  let openAt = -1
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i]
    if (ch === ')') unmatched++
    else if (ch === '(') {
      if (unmatched === 0) {
        openAt = i
        break
      }
      unmatched--
    }
  }
  if (openAt < 0) return false
  // Is the token immediately before `openAt` an is*/has*/assert*/check*/validate* identifier?
  const head = window.slice(0, openAt)
  return /\b(?:is|has|assert|validate|check)[A-Z]\w*\s*$/.test(head)
}

/**
 * Mask the inside of every backtick-delimited template-literal with
 * spaces. Preserves length so positions/lines/columns stay aligned.
 * Used to keep the literal scanner from counting `{type,props,children}`
 * patterns that live inside test FIXTURE strings (the `cli/doctor.test.ts`
 * case — those are fixtures for the audit tool itself, not actual code).
 *
 * Limitations: doesn't parse `${...}` interpolations precisely. If a
 * fixture contains a balanced `${ ... }` with code we'd want scanned,
 * the surrounding template string still masks it. In practice, mock-
 * vnode literals are never interpolation expressions, so this is fine.
 */
function maskTemplateStrings(source: string): string {
  return source.replace(/`(?:\\.|[^`\\])*`/g, (m) => `\`${' '.repeat(m.length - 2)}\``)
}

function countMatches(source: string, pattern: RegExp): number {
  let count = 0
  pattern.lastIndex = 0
  while (pattern.exec(source) !== null) count++
  pattern.lastIndex = 0
  return count
}

/**
 * Counts `{type, props, children}` literals, skipping those that
 * appear inside a type-guard-looking call OR inside a template-literal
 * (which is fixture text, not code). Dedicated because the existing
 * `countMatches` helper has no context-aware skip.
 */
function countMockVNodeLiterals(source: string): number {
  // First mask template-literal contents — fixtures inside backticks
  // (e.g. `\`const v = { type, props, children }\`` written via
  // writeFile in audit's own test) shouldn't count. The mask
  // preserves positions, so the type-guard skip logic still works.
  const masked = maskTemplateStrings(source)
  const pattern = MOCK_VNODE_LITERAL_PATTERN
  let count = 0
  pattern.lastIndex = 0
  let m: RegExpExecArray | null
  while (true) {
    m = pattern.exec(masked)
    if (m === null) break
    if (!isLiteralInsideTypeGuardCall(masked, m.index)) count++
  }
  pattern.lastIndex = 0
  return count
}

function classifyRisk(entry: Omit<TestAuditEntry, 'risk'>): AuditRisk {
  const mocks =
    entry.mockVNodeLiteralCount + entry.mockHelperCount + entry.mockHelperCallCount
  if (mocks === 0) return 'low'
  if (!entry.importsH && entry.realHCallCount === 0) return 'high'
  if (entry.realHCallCount >= mocks) return 'low'
  return 'medium'
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export function auditTestEnvironment(startDir: string): TestAuditResult {
  // Caller-supplied `startDir` (no default) — `runtime-dom` transitively
  // pulls this file via the `@pyreon/compiler` JSX runtime entry, and its
  // tsconfig narrows `process` to `{ env: ... }` only. Calling
  // `process.cwd()` here breaks that typecheck. MCP / CLI both have full
  // node types; let them resolve cwd at the call site.
  const root = findMonorepoRoot(startDir)
  if (!root) return { root: null, entries: [], totalScanned: 0 }

  const files: string[] = []
  walkTestFiles(join(root, 'packages'), files)

  const entries: TestAuditEntry[] = []
  for (const path of files) {
    let source: string
    try {
      source = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    // Skip the scanner's own test fixtures so `audit_test_environment`
    // doesn't report itself.
    if (path.includes('test-audit.test.ts') || path.includes('test-audit-fixture')) {
      continue
    }

    // Mask template-literal contents once, then run every counter
    // against the masked source. Patterns inside backticks are
    // FIXTURE strings (the audit tool's own test fixtures, doctest
    // examples, etc.) — they shouldn't count toward any metric.
    // `countMockVNodeLiterals` already does its own masking and runs
    // on `source` so it can do its own work; we pass `source` to
    // keep that contract intact.
    const masked = maskTemplateStrings(source)
    const mockVNodeLiteralCount = countMockVNodeLiterals(source)
    const mockHelperCount = countMatches(masked, MOCK_HELPER_PATTERN)
    const mockHelperCallCount = countMatches(masked, MOCK_HELPER_CALL_PATTERN)
    const realHCallCount = countMatches(masked, REAL_H_CALL_PATTERN)
    const importsH = IMPORT_H_PATTERN.test(masked)

    const base = {
      path,
      relPath: relative(root, path),
      mockVNodeLiteralCount,
      mockHelperCount,
      mockHelperCallCount,
      realHCallCount,
      importsH,
    }
    entries.push({ ...base, risk: classifyRisk(base) })
  }

  const riskRank = { high: 0, medium: 1, low: 2 }
  entries.sort((a, b) => {
    const cmp = riskRank[a.risk] - riskRank[b.risk]
    if (cmp !== 0) return cmp
    return a.relPath.localeCompare(b.relPath)
  })

  return { root, entries, totalScanned: files.length }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuditFormatOptions {
  /** Only include entries at or above this risk level. Default 'medium'. */
  minRisk?: AuditRisk | undefined
  /** Maximum entries to show per risk group. Default 20. */
  limit?: number | undefined
}

function riskAtOrAbove(risk: AuditRisk, min: AuditRisk): boolean {
  const rank = { high: 0, medium: 1, low: 2 }
  return rank[risk] <= rank[min]
}

export function formatTestAudit(
  result: TestAuditResult,
  { minRisk = 'medium', limit = 20 }: AuditFormatOptions = {},
): string {
  if (!result.root) {
    return (
      'No monorepo root found. This tool scans `packages/**/*.test.{ts,tsx}` ' +
      'for mock-vnode patterns. Run the MCP from the Pyreon repo root to ' +
      'get useful output.'
    )
  }

  const relevant = result.entries.filter((e) => riskAtOrAbove(e.risk, minRisk))
  const counts = {
    high: result.entries.filter((e) => e.risk === 'high').length,
    medium: result.entries.filter((e) => e.risk === 'medium').length,
    low: result.entries.filter((e) => e.risk === 'low').length,
  }
  const withMocks = result.entries.filter(
    (e) => e.mockVNodeLiteralCount + e.mockHelperCount > 0,
  ).length

  const parts: string[] = []
  parts.push(`# Test environment audit — ${result.totalScanned} test files scanned`)
  parts.push('')
  parts.push(
    `**Mock-vnode exposure**: ${withMocks} / ${result.totalScanned} files construct \`{ type, props, children }\` literals or a custom \`vnode()\` helper instead of going through the real \`h()\` from \`@pyreon/core\`. This is the bug class that caused PR #197's silent metadata drop — mock-only tests pass while the real pipeline (rocketstyle attrs, compiler transforms, props forwarding) stays unexercised.`,
  )
  parts.push('')
  parts.push(`**Risk counts**: ${counts.high} high · ${counts.medium} medium · ${counts.low} low`)
  parts.push('')

  if (relevant.length === 0) {
    parts.push(`No files at risk level "${minRisk}" or above. Every test file either avoids mocks entirely or pairs them with real-\`h()\` coverage.`)
    return parts.join('\n')
  }

  const byRisk = new Map<AuditRisk, TestAuditEntry[]>()
  for (const entry of relevant) {
    if (!byRisk.has(entry.risk)) byRisk.set(entry.risk, [])
    byRisk.get(entry.risk)!.push(entry)
  }

  for (const [risk, group] of byRisk) {
    const shown = group.slice(0, limit)
    parts.push(`## ${risk.toUpperCase()} — ${group.length} file${group.length === 1 ? '' : 's'}${shown.length < group.length ? ` (showing ${shown.length})` : ''}`)
    parts.push('')
    parts.push(describeRisk(risk))
    parts.push('')
    for (const entry of shown) {
      const mocks =
        entry.mockVNodeLiteralCount + entry.mockHelperCount + entry.mockHelperCallCount
      const breakdown: string[] = []
      if (entry.mockVNodeLiteralCount > 0) breakdown.push(`${entry.mockVNodeLiteralCount} literal${entry.mockVNodeLiteralCount === 1 ? '' : 's'}`)
      if (entry.mockHelperCount > 0) breakdown.push(`${entry.mockHelperCount} helper${entry.mockHelperCount === 1 ? '' : 's'}`)
      if (entry.mockHelperCallCount > 0) breakdown.push(`${entry.mockHelperCallCount} helper call${entry.mockHelperCallCount === 1 ? '' : 's'}`)
      const hSide =
        entry.realHCallCount > 0
          ? `${entry.realHCallCount} real h() call${entry.realHCallCount === 1 ? '' : 's'}`
          : entry.importsH
            ? `imports h but 0 calls found`
            : `no h import`
      parts.push(`- ${entry.relPath} — ${mocks} mock signal${mocks === 1 ? '' : 's'} (${breakdown.join(' + ')}), ${hSide}`)
    }
    parts.push('')
  }

  parts.push('---')
  parts.push('')
  parts.push(
    'Fix: for each HIGH file, add at least one test that imports `h` from `@pyreon/core` and renders the actual component through `h(RealComponent, props)`. The mock version can stay for speed — it is the LACK of a real-`h()` parallel that blocks bug surfacing.',
  )
  return parts.join('\n')
}

function describeRisk(risk: AuditRisk): string {
  if (risk === 'high') {
    return 'Mock patterns present, no real `h()` calls, and no `h` import from `@pyreon/core`. The file has no pathway to exercise the real pipeline — bugs like PR #197 would slip through.'
  }
  if (risk === 'medium') {
    return 'Mock patterns present AND some real `h()` usage — but mocks outnumber real calls, so specific scenarios may be mock-only. Spot-check that each contract the tests assert on goes through at least one real-`h()` path.'
  }
  return 'Mocks dwarfed by real usage OR no mocks at all — low risk.'
}
