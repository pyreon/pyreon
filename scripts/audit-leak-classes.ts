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

// Cross-runtime path resolution: `import.meta.dir` is Bun-only;
// `import.meta.url` works in both Bun and Node (vitest). The script
// runs under Bun in production but under vitest's Node runtime for
// tests — we need both paths to land at the repo root.
// Bun exposes `import.meta.dir` directly; vitest's Node runtime does
// not declare it in the standard ImportMeta type. Cast through `any`
// here and fall through to `import.meta.url` resolution under Node.
const HERE = (import.meta as { dir?: string }).dir ?? dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

// ─── Types ──────────────────────────────────────────────────────────────────

export type DetectorId =
  | 'unbounded-cache'
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
    } catch {
      return
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        recurse(full)
      } else if (
        (full.endsWith('.ts') || full.endsWith('.tsx')) &&
        !SKIP_FILE_SUFFIXES.some((s) => full.endsWith(s))
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
  const findings: Finding[] = []
  // Match MODULE-LEVEL only — no leading whitespace before `const|let`.
  // This excludes local declarations inside function bodies (which are
  // GC-safe — they die with their function scope). The `^` anchor with
  // `m` flag requires the declaration to start at column 0.
  const declRe =
    /^(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?=\s*new\s+(Map|Set|WeakMap|WeakSet)\b/gm
  let match: RegExpExecArray | null
  while ((match = declRe.exec(source)) !== null) {
    const varName = match[1]!
    const collection = match[2]!
    const declOffset = match.index + match[0].indexOf(varName)

    // WeakMap / WeakSet are GC-safe by design — never an unbounded leak.
    if (collection.startsWith('Weak')) continue

    // Tally writes / deletes against this variable in the same file.
    const writeRe = new RegExp(`\\b${varName}\\.(set|add)\\b`, 'g')
    const evictRe = new RegExp(`\\b${varName}\\.(delete|clear)\\b`, 'g')
    const writes = (source.match(writeRe) || []).length
    const evicts = (source.match(evictRe) || []).length

    if (writes >= 1 && evicts === 0) {
      findings.push({
        detector: 'unbounded-cache',
        file: filePath,
        line: lineOf(source, declOffset),
        leakClass: 'C',
        message: `Module-level \`${collection}\` "${varName}" has ${writes} write(s) but no \`.delete()\` / \`.clear()\` in same file — unbounded growth risk. Cross-file eviction paths invisible to scan (manual triage).`,
        context: snippet(source, declOffset),
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
  const adds = (source.match(/\baddEventListener\s*\(/g) || []).length
  const removes = (source.match(/\bremoveEventListener\s*\(/g) || []).length
  if (adds === 0 || adds === removes) return []
  if (adds <= removes) return [] // surplus removes is fine
  return [
    {
      detector: 'unbalanced-listeners',
      file: filePath,
      line: 1,
      leakClass: 'D',
      message: `${adds} addEventListener call(s) vs ${removes} removeEventListener — possible Class D listener pile-up. Verify each registration has a paired cleanup or refcount guard.`,
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
  const findings: Finding[] = []
  // Module-level array-typed declaration (column-0 anchor — local
  // arrays inside function bodies are GC-safe). Match either `: T[] = []`
  // or `: Array<T> = []` or generic `= []` with no type annotation.
  const declRe =
    /^(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::\s*(?:[\w]+\[\]|Array<[^>]+>)\s*)?=\s*\[\s*\]/gm
  let match: RegExpExecArray | null
  while ((match = declRe.exec(source)) !== null) {
    const varName = match[1]!
    // Look for `.pop()` calls against this variable.
    const popRe = new RegExp(`\\b${varName}\\.pop\\s*\\(`, 'g')
    const popMatch = popRe.exec(source)
    if (!popMatch) continue

    findings.push({
      detector: 'position-based-pop',
      file: filePath,
      line: lineOf(source, popMatch.index),
      leakClass: 'A',
      message: `Module-level array "${varName}" uses \`.pop()\` — Class A position-based-cleanup risk. Verify removal order is strictly LIFO across reactive boundaries. If not, switch to identity-based removal: \`stack.splice(stack.lastIndexOf(frame), 1)\`.`,
      context: snippet(source, popMatch.index),
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
  const findings: Finding[] = []
  // Find every Promise.race(...) call site. For each, look for setTimeout
  // in the argument array AND clearTimeout in the surrounding 500 chars.
  const raceRe = /Promise\.race\s*\(\s*\[/g
  let match: RegExpExecArray | null
  while ((match = raceRe.exec(source)) !== null) {
    const offset = match.index
    // Look ahead ~800 chars for the closing `])` and the contents.
    const tail = source.slice(offset, offset + 800)
    const hasSetTimeout = /setTimeout\s*\(/.test(tail)
    if (!hasSetTimeout) continue
    // Look at the enclosing function (rough heuristic) for a clearTimeout
    // call in a finally block. Use 5000 chars — most try/catch/finally
    // bodies fit; longer ones become false positives the human triages.
    const enclosing = source.slice(offset, offset + 5000)
    const hasFinally = /finally\s*\{/.test(enclosing)
    const hasClearTimeout = /clearTimeout\s*\(/.test(enclosing)
    if (hasFinally && hasClearTimeout) continue

    findings.push({
      detector: 'promise-race-no-clear',
      file: filePath,
      line: lineOf(source, offset),
      leakClass: 'I',
      message: `\`Promise.race\` with a \`setTimeout\` rejection branch — no \`clearTimeout\` found in nearby finally block. Capture the timer id and clear it on the success path. Mirror of \`pyreon/promise-race-needs-cleartimeout\` lint rule.`,
      context: snippet(source, offset),
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
    } catch {
      continue
    }
    for (const pkg of readdirSync(categoryDir)) {
      const pkgDir = join(categoryDir, pkg)
      try {
        const stat = statSync(pkgDir)
        if (!stat.isDirectory()) continue
      } catch {
        continue
      }
      const srcDir = join(pkgDir, 'src')
      try {
        if (statSync(srcDir).isDirectory()) {
          if (filter && !`@pyreon/${pkg}`.includes(filter) && !pkg.includes(filter)) continue
          dirs.push(srcDir)
        }
      } catch {
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
} else {
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
  } else {
    // oxlint-disable-next-line no-console
    console.log(`\n=== audit-leak-classes ===\n`)
    if (allFindings.length === 0) {
      // oxlint-disable-next-line no-console
      console.log(`No findings across ${srcDirs.length} package(s).`)
    } else {
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
        console.log(`\n--- ${id} (Class ${list[0]!.leakClass}) — ${list.length} finding(s) ---\n`)
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
      console.log(`\nTotal: ${allFindings.length} finding(s) across ${srcDirs.length} package(s).`)
      // oxlint-disable-next-line no-console
      console.log(
        `\nNOTE: this audit is permissive — false positives expected. See\n  .claude/rules/anti-patterns.md "Memory Leak Classes" for the canonical fix shapes.`,
      )
    }
  }

  // Never exit non-zero — this is an advisory audit, not a CI gate.
  process.exit(0)
}
