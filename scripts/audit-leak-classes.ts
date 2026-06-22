#!/usr/bin/env bun
/**
 * audit-leak-classes — periodic static audit for the 5 memory-leak
 * classes catalogued in `.claude/rules/anti-patterns.md`.
 *
 * Why this exists: the 8-PR sweep across #725-#741 produced two
 * preventative lint rules (`pyreon/promise-race-needs-cleartimeout`,
 * `pyreon/init-fn-needs-idempotency`) for the two patterns with high
 * static-analysis precision. The OTHER leak classes (A position-based
 * pop, C unbounded cache, D unbalanced listeners, F stale resolution)
 * are too context-dependent for a CI-gating lint rule but ARE catchable
 * by a permissive offline scan — produces a one-shot report that an
 * audit subagent or human can triage.
 *
 * Detectors:
 *
 *   1. unbounded-cache       — module-level Map/Set with .set/.add
 *                              calls and no .delete/.clear in same
 *                              file. Class C shape.
 *   2. unbalanced-listeners  — addEventListener count > removeEventListener
 *                              count in the same file. Class D shape.
 *   3. position-based-pop    — module-level Array with .pop() calls.
 *                              Advisory — Class A shape, manual review
 *                              for LIFO contract.
 *   4. promise-race-no-clear — Promise.race + setTimeout without a
 *                              clearTimeout in same try-block. Class I
 *                              shape. Cross-package mirror of the
 *                              lint rule.
 *
 * Heuristic: each detector is permissive — false positives are
 * expected. The output is a report for manual review, NOT a CI gate.
 * Run before/after a leak-class-relevant refactor or as a periodic
 * sweep.
 *
 * Run:
 *   bun run audit-leak-classes                     # all packages
 *   bun run audit-leak-classes <package>           # one package
 *   bun run audit-leak-classes --json              # machine-readable
 *   bun run audit-leak-classes --detector=class-c  # one detector
 *
 * @internal — diagnostic tool. Not part of the published API.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'

// Cross-runtime path resolution: `import.meta.dir` is Bun-only;
// `import.meta.url` works in both Bun and Node (vitest). The script
// runs under Bun in production but under vitest's Node runtime for
// tests — we need both paths to land at the repo root.
// Bun exposes `import.meta.dir` directly; vitest's Node runtime does
// not declare it in the standard ImportMeta type. Cast through `any`
// here and fall through to `import.meta.url` resolution under Node.
const HERE
  = (import.meta as { dir?: string }).dir
    ?? dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

// ─── Types ──────────────────────────────────────────────────────────────────

export type DetectorId
  = | 'unbounded-cache'
    | 'unbalanced-listeners'
    | 'position-based-pop'
    | 'promise-race-no-clear'

export interface Finding {
  detector: DetectorId
  file: string
  line: number
  message: string
  context: string
  /** Class label from `.claude/rules/anti-patterns.md` */
  leakClass: 'A' | 'C' | 'D' | 'I'
}

// ─── Walk helpers ───────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  'lib',
  'dist',
  'build',
  '__tests__',
  'tests',
  '.git',
  '.turbo',
  'coverage',
])
const SKIP_FILE_SUFFIXES = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.d.ts',
  '.test.helpers.ts',
]

function walkSourceFiles(root: string): string[] {
  const out: string[] = []
  function recurse(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    }
    catch {
      return
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      }
      catch {
        continue
      }
      if (st.isDirectory()) {
        recurse(full)
      }
      else if (
        (full.endsWith('.ts') || full.endsWith('.tsx'))
        && !SKIP_FILE_SUFFIXES.some((s) => full.endsWith(s))
      ) {
        out.push(full)
      }
    }
  }
  recurse(root)
  return out
}

function lineOf(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

function snippet(source: string, offset: number, len = 80): string {
  const start = Math.max(0, offset - 20)
  const end = Math.min(source.length, offset + len)
  return source.slice(start, end).replace(/\s+/g, ' ').trim()
}

// ─── AST helpers (oxc-parser) ─────────────────────────────────────────────────
//
// Detection is AST-based, NOT regex-based. The earlier regex detectors counted
// textual occurrences of `addEventListener(` / `Promise.race([` etc. — which
// fired on STRING LITERALS, COMMENTS, and CODEGEN TEMPLATE LITERALS that don't
// register anything at runtime. The whole `@pyreon/compiler`, `@pyreon/lint`,
// and test-fixture surface is full of such mentions (the compiler EMITS
// `el.addEventListener(...)` as a string; lint rules DESCRIBE the patterns they
// detect; docstrings show example shapes). Those are false positives by
// construction. Parsing to an AST and counting only real `CallExpression` /
// `NewExpression` nodes eliminates the entire class of mention-not-call FPs —
// the same "AST beats regex for JS" discipline `@pyreon/lint` itself uses.

interface AstNode {
  type?: string
  [key: string]: unknown
}

function getLang(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (filePath.endsWith('.tsx')) return 'tsx'
  if (filePath.endsWith('.jsx')) return 'jsx'
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) return 'js'
  return 'ts'
}

// Parse-once cache keyed by source text — each detector is a pure
// `(source, filePath)` fn (the test contract), but the CLI calls all four per
// file. Caching by source avoids re-parsing the same file four times.
const _parseCache = new Map<string, AstNode | null>()

function parseAst(source: string, filePath: string): AstNode | null {
  const cached = _parseCache.get(source)
  if (cached !== undefined) return cached
  let program: AstNode | null = null
  try {
    const result = parseSync(filePath, source, { sourceType: 'module', lang: getLang(filePath) })
    // A file with fatal parse errors yields an unusable tree — skip it
    // (advisory audit; a file the compiler can't parse isn't ours to judge).
    program = (result.errors?.length ?? 0) > 0 ? null : (result.program as AstNode)
  }
  catch {
    program = null
  }
  if (_parseCache.size > 4000) _parseCache.clear()
  _parseCache.set(source, program)
  return program
}

// Visit every AST node (depth-first). Skips positional / metadata keys.
function walk(node: unknown, visit: (n: AstNode) => void): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  const n = node as AstNode
  if (typeof n.type === 'string') visit(n)
  for (const key in n) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range' || key === 'loc' || key === 'parent') continue
    walk(n[key], visit)
  }
}

// A non-computed member call like `obj.method(...)` — returns the method name,
// or undefined if `callee` is not a static member access. Handles the
// optional-chaining (`obj?.method()`) shape too (the property still resolves).
function memberCallName(callee: unknown): string | undefined {
  const c = callee as AstNode | undefined
  if (!c || c.type !== 'MemberExpression' || c.computed) return undefined
  const prop = c.property as AstNode | undefined
  return prop?.type === 'Identifier' ? (prop.name as string) : undefined
}

// The object identifier of a member call `X.method(...)` → `X`, else undefined.
function memberObjectName(callee: unknown): string | undefined {
  const c = callee as AstNode | undefined
  if (!c || c.type !== 'MemberExpression') return undefined
  const obj = c.object as AstNode | undefined
  return obj?.type === 'Identifier' ? (obj.name as string) : undefined
}

// Byte offset of a node (ESTree `start`, with `range[0]` fallback).
function nodeStart(n: AstNode): number {
  if (typeof n.start === 'number') return n.start
  if (Array.isArray(n.range) && typeof n.range[0] === 'number') return n.range[0]
  return 0
}
function nodeEnd(n: AstNode): number {
  if (typeof n.end === 'number') return n.end
  if (Array.isArray(n.range) && typeof n.range[1] === 'number') return n.range[1]
  return 0
}

// Module-level declarations = direct children of `Program.body`, optionally
// wrapped in `export …`. Returns each top-level `VariableDeclaration`.
function topLevelVarDecls(program: AstNode): AstNode[] {
  const out: AstNode[] = []
  for (const stmt of (program.body as AstNode[]) ?? []) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? (stmt.declaration as AstNode | undefined) : stmt
    if (decl && decl.type === 'VariableDeclaration') out.push(decl)
  }
  return out
}

// ─── Detector 1: unbounded-cache (Class C) ──────────────────────────────────
//
// Find module-level `new Map()` / `new Set()` declarations. For each,
// count `.set(` / `.add(` calls (writes) vs `.delete(` / `.clear(` calls
// (evictions) in the same file. Flag if writes occur AND no eviction
// path exists in the same file.
//
// Heuristic: cross-file eviction paths (a separate `evict()` exported
// for callers) are invisible to this scan — false negative. Module-level
// caches with explicit deletion in same file (the healthy pattern, e.g.
// LRU eviction) don't fire.

export function detectUnboundedCache(source: string, filePath: string): Finding[] {
  const program = parseAst(source, filePath)
  if (!program) return []
  const findings: Finding[] = []

  // Module-level `new Map()` / `new Set()` declarations (WeakMap/WeakSet are
  // GC-safe by design → excluded). Local caches inside a function body die
  // with their scope, so only top-level declarations are considered.
  const caches: { name: string, collection: string, offset: number }[] = []
  for (const decl of topLevelVarDecls(program)) {
    for (const d of (decl.declarations as AstNode[]) ?? []) {
      const id = d.id as AstNode | undefined
      const init = d.init as AstNode | undefined
      if (id?.type !== 'Identifier' || init?.type !== 'NewExpression') continue
      const callee = init.callee as AstNode | undefined
      const cname = callee?.type === 'Identifier' ? (callee.name as string) : undefined
      if (cname !== 'Map' && cname !== 'Set') continue
      caches.push({ name: id.name as string, collection: cname, offset: nodeStart(d) })
    }
  }
  if (caches.length === 0) return []

  // Tally real `.set(`/`.add(` (writes) vs `.delete(`/`.clear(` (evictions)
  // member CALLS against each cache var across the file — AST, so a method
  // name appearing in a string/comment never counts.
  const writes: Record<string, number> = {}
  const evicts: Record<string, number> = {}
  walk(program, (n) => {
    if (n.type === 'CallExpression') {
      const obj = memberObjectName(n.callee)
      const m = memberCallName(n.callee)
      if (!obj || !m) return
      if (m === 'set' || m === 'add') writes[obj] = (writes[obj] ?? 0) + 1
      else if (m === 'delete' || m === 'clear') evicts[obj] = (evicts[obj] ?? 0) + 1
      return
    }
    // Reassignment to a fresh `new Map()` / `new Set()` is a valid bounded
    // RESET (`_registry = new Map()` between runs) — not an unbounded leak.
    // Common in per-run module-level registries (e.g. the native emitters).
    // Count it as an eviction path so it doesn't false-positive.
    if (n.type === 'AssignmentExpression') {
      const left = n.left as AstNode | undefined
      const right = n.right as AstNode | undefined
      if (left?.type === 'Identifier' && right?.type === 'NewExpression') {
        const cn = (right.callee as AstNode | undefined)?.type === 'Identifier'
          ? ((right.callee as AstNode).name as string)
          : undefined
        if (cn === 'Map' || cn === 'Set') {
          evicts[left.name as string] = (evicts[left.name as string] ?? 0) + 1
        }
      }
    }
  })

  for (const c of caches) {
    if ((writes[c.name] ?? 0) >= 1 && (evicts[c.name] ?? 0) === 0) {
      findings.push({
        detector: 'unbounded-cache',
        file: filePath,
        line: lineOf(source, c.offset),
        leakClass: 'C',
        message:
          `Module-level \`${c.collection}\` "${c.name}" has ${writes[c.name]} write(s) but no \`.delete()\` / \`.clear()\` in same file — unbounded growth risk. Cross-file eviction paths invisible to scan (manual triage).`,
        context: snippet(source, c.offset),
      })
    }
  }
  return findings
}

// ─── Detector 2: unbalanced-listeners (Class D) ─────────────────────────────
//
// Count `addEventListener(` vs `removeEventListener(` calls in the same
// file. Mismatch = either missing cleanup OR listener registered without
// owning cleanup path. False positive: imperative cleanup elsewhere
// (Pyreon's lifecycle hooks own the removeEventListener call, NOT the
// site that called addEventListener). Use raw counts as a triage signal.

export function detectUnbalancedListeners(source: string, filePath: string): Finding[] {
  const program = parseAst(source, filePath)
  if (!program) return []
  // Count REAL `.addEventListener(...)` / `.removeEventListener(...)` member
  // CALLS — not textual mentions. This is the fix for the dominant
  // false-positive class: the compiler emits `el.addEventListener(...)` as a
  // codegen STRING, lint rules describe the pattern in docstrings, and
  // detectors compare against the `'addEventListener'` string literal — none
  // of those register a listener, and none are CallExpressions.
  let adds = 0
  let removes = 0
  walk(program, (n) => {
    if (n.type !== 'CallExpression') return
    const m = memberCallName(n.callee)
    if (m === 'addEventListener') adds++
    else if (m === 'removeEventListener') removes++
  })
  if (adds === 0 || adds <= removes) return [] // balanced or surplus removes is fine
  return [
    {
      detector: 'unbalanced-listeners',
      file: filePath,
      line: 1,
      leakClass: 'D',
      message:
        `${adds} addEventListener call(s) vs ${removes} removeEventListener — possible Class D listener pile-up. Verify each registration has a paired cleanup or refcount guard.`,
      context: `add=${adds} remove=${removes}`,
    },
  ]
}

// ─── Detector 3: position-based-pop (Class A) ───────────────────────────────
//
// Find module-level `let|const X: Array<…> = []` / `: T[] = []` declarations
// where the same file calls `X.pop()` elsewhere. If the pop happens in a
// cleanup hook (onUnmount, finally, dispose) AND the push order may not
// be strict LIFO across reactive boundaries, this is the #725 bug shape.
//
// Heuristic: this detector is the most permissive of the four — many
// legitimate stacks (parser state, undo history) use position-based pop
// correctly. The audit report is "consider whether non-LIFO removal is
// possible", not "this is a bug".

export function detectPositionBasedPop(source: string, filePath: string): Finding[] {
  const program = parseAst(source, filePath)
  if (!program) return []
  const findings: Finding[] = []

  // Module-level `= []` array declarations (local arrays inside function
  // bodies are GC-safe). The type annotation (`: T[]`) is irrelevant — the
  // empty-array-literal initializer is the signal.
  const arrays = new Map<string, number>()
  for (const decl of topLevelVarDecls(program)) {
    for (const d of (decl.declarations as AstNode[]) ?? []) {
      const id = d.id as AstNode | undefined
      const init = d.init as AstNode | undefined
      if (id?.type !== 'Identifier' || init?.type !== 'ArrayExpression') continue
      if (((init.elements as unknown[])?.length ?? 0) !== 0) continue
      arrays.set(id.name as string, nodeStart(d))
    }
  }
  if (arrays.size === 0) return []

  // First real `.pop()` member call per tracked array var.
  const popOffset = new Map<string, number>()
  walk(program, (n) => {
    if (n.type !== 'CallExpression') return
    const obj = memberObjectName(n.callee)
    if (memberCallName(n.callee) === 'pop' && obj && arrays.has(obj) && !popOffset.has(obj)) {
      popOffset.set(obj, nodeStart(n))
    }
  })

  for (const [varName, off] of popOffset) {
    findings.push({
      detector: 'position-based-pop',
      file: filePath,
      line: lineOf(source, off),
      leakClass: 'A',
      message:
        `Module-level array "${varName}" uses \`.pop()\` — Class A position-based-cleanup risk. Verify removal order is strictly LIFO across reactive boundaries. If not, switch to identity-based removal: \`stack.splice(stack.lastIndexOf(frame), 1)\`.`,
      context: snippet(source, off),
    })
  }
  return findings
}

// ─── Detector 4: promise-race-no-clear (Class I) ────────────────────────────
//
// Find `Promise.race([…, setTimeout-rejection])` patterns. Check the
// enclosing try-block has `clearTimeout` in a finally. This is a
// cross-package mirror of the `pyreon/promise-race-needs-cleartimeout`
// lint rule — the rule is in `@pyreon/lint`'s `recommended` preset
// going forward, but this audit catches the pattern in code that may
// not be running the lint preset (e.g. scripts, examples, vendored
// deps under packages/).

export function detectPromiseRaceNoClear(source: string, filePath: string): Finding[] {
  const program = parseAst(source, filePath)
  if (!program) return []
  const findings: Finding[] = []

  // Collect (AST, so docstring/example mentions never count): enclosing
  // function spans, real `clearTimeout(...)` call offsets, and real
  // `Promise.race(...)` calls whose argument subtree contains a real
  // `setTimeout(...)` call.
  const functions: { start: number, end: number }[] = []
  const clearTimeouts: number[] = []
  const races: { offset: number, hasSetTimeout: boolean }[] = []
  walk(program, (n) => {
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      functions.push({ start: nodeStart(n), end: nodeEnd(n) })
      return
    }
    if (n.type !== 'CallExpression') return
    const callee = n.callee as AstNode | undefined
    if (callee?.type === 'Identifier' && callee.name === 'clearTimeout') {
      clearTimeouts.push(nodeStart(n))
      return
    }
    if (memberCallName(callee) === 'race' && memberObjectName(callee) === 'Promise') {
      let hasSetTimeout = false
      walk(n.arguments, (m) => {
        const c = m.callee as AstNode | undefined
        if (m.type === 'CallExpression' && c?.type === 'Identifier' && c.name === 'setTimeout') hasSetTimeout = true
      })
      races.push({ offset: nodeStart(n), hasSetTimeout })
    }
  })

  for (const race of races) {
    if (!race.hasSetTimeout) continue
    // Smallest enclosing function span that contains the race.
    let enc: { start: number, end: number } | null = null
    for (const f of functions) {
      if (f.start <= race.offset && race.offset < f.end) {
        if (!enc || (f.end - f.start) < (enc.end - enc.start)) enc = f
      }
    }
    const hasClear = enc
      ? clearTimeouts.some((o) => enc!.start <= o && o < enc!.end)
      : clearTimeouts.length > 0
    if (hasClear) continue

    findings.push({
      detector: 'promise-race-no-clear',
      file: filePath,
      line: lineOf(source, race.offset),
      leakClass: 'I',
      message:
        `\`Promise.race\` with a \`setTimeout\` rejection branch — no \`clearTimeout\` found in the enclosing function. Capture the timer id and clear it on the success path. Mirror of \`pyreon/promise-race-needs-cleartimeout\` lint rule.`,
      context: snippet(source, race.offset),
    })
  }
  return findings
}

// ─── Detector pipeline ──────────────────────────────────────────────────────

const DETECTORS: Record<DetectorId, (source: string, filePath: string) => Finding[]> = {
  'unbounded-cache': detectUnboundedCache,
  'unbalanced-listeners': detectUnbalancedListeners,
  'position-based-pop': detectPositionBasedPop,
  'promise-race-no-clear': detectPromiseRaceNoClear,
}

function auditFile(filePath: string, only?: DetectorId): Finding[] {
  const source = readFileSync(filePath, 'utf8')
  const findings: Finding[] = []
  for (const id of Object.keys(DETECTORS) as DetectorId[]) {
    if (only && only !== id) continue
    findings.push(...DETECTORS[id](source, filePath))
  }
  return findings
}

// ─── Package discovery ──────────────────────────────────────────────────────

function findPackageSrcDirs(filter?: string): string[] {
  const packagesRoot = join(REPO_ROOT, 'packages')
  const dirs: string[] = []
  for (const category of readdirSync(packagesRoot)) {
    const categoryDir = join(packagesRoot, category)
    try {
      if (!statSync(categoryDir).isDirectory()) continue
    }
    catch {
      continue
    }
    for (const pkg of readdirSync(categoryDir)) {
      const pkgDir = join(categoryDir, pkg)
      try {
        const stat = statSync(pkgDir)
        if (!stat.isDirectory()) continue
      }
      catch {
        continue
      }
      const srcDir = join(pkgDir, 'src')
      try {
        if (statSync(srcDir).isDirectory()) {
          if (filter && !`@pyreon/${pkg}`.includes(filter) && !pkg.includes(filter)) continue
          dirs.push(srcDir)
        }
      }
      catch {
        continue
      }
    }
  }
  return dirs
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
//
// Gated by `import.meta.main` — the CLI runs ONLY when this file is the
// process entry point (`bun scripts/audit-leak-classes.ts`). When the
// detector functions are imported for unit tests, the CLI block stays
// silent.

if (!import.meta.main) {
  // Imported as a module — skip the CLI driver.
}
else {
const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const detectorArg = args.find((a) => a.startsWith('--detector='))
const onlyDetector = detectorArg
  ? (detectorArg.slice('--detector='.length) as DetectorId)
  : undefined
const packageFilter = args.find((a) => !a.startsWith('--'))

if (onlyDetector && !(onlyDetector in DETECTORS)) {
  // oxlint-disable-next-line no-console
  console.error(`Unknown detector: ${onlyDetector}`)
  // oxlint-disable-next-line no-console
  console.error(`Valid: ${Object.keys(DETECTORS).join(', ')}`)
  process.exit(2)
}

const srcDirs = findPackageSrcDirs(packageFilter)
const allFindings: Finding[] = []
for (const srcDir of srcDirs) {
  for (const file of walkSourceFiles(srcDir)) {
    allFindings.push(...auditFile(file, onlyDetector))
  }
}

if (jsonMode) {
  // oxlint-disable-next-line no-console
  console.log(JSON.stringify({ findings: allFindings, total: allFindings.length }, null, 2))
}
else {
  // oxlint-disable-next-line no-console
  console.log(`\n=== audit-leak-classes ===\n`)
  if (allFindings.length === 0) {
    // oxlint-disable-next-line no-console
    console.log(`No findings across ${srcDirs.length} package(s).`)
  }
  else {
    // Group by detector.
    const grouped: Record<DetectorId, Finding[]> = {
      'unbounded-cache': [],
      'unbalanced-listeners': [],
      'position-based-pop': [],
      'promise-race-no-clear': [],
    }
    for (const f of allFindings) grouped[f.detector].push(f)
    for (const id of Object.keys(grouped) as DetectorId[]) {
      const list = grouped[id]
      if (list.length === 0) continue
      // oxlint-disable-next-line no-console
      console.log(
        `\n--- ${id} (Class ${list[0]!.leakClass}) — ${list.length} finding(s) ---\n`,
      )
      for (const f of list) {
        // oxlint-disable-next-line no-console
        console.log(`  ${relative(REPO_ROOT, f.file)}:${f.line}`)
        // oxlint-disable-next-line no-console
        console.log(`    ${f.message}`)
        // oxlint-disable-next-line no-console
        console.log(`    ${f.context}`)
        // oxlint-disable-next-line no-console
        console.log()
      }
    }
    // oxlint-disable-next-line no-console
    console.log(
      `\nTotal: ${allFindings.length} finding(s) across ${srcDirs.length} package(s).`,
    )
    // oxlint-disable-next-line no-console
    console.log(
      `\nNOTE: this audit is permissive — false positives expected. See\n  .claude/rules/anti-patterns.md "Memory Leak Classes" for the canonical fix shapes.`,
    )
  }
}

// Never exit non-zero — this is an advisory audit, not a CI gate.
process.exit(0)
}
