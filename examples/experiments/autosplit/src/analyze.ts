/**
 * Experiment: auto-split — static reachability+weight analyzer.
 *
 * Question: can a static pass identify the code-split boundaries a
 * competent dev would hand-write (lazy()/island), well enough that
 * auto-splitting matches/beats the manual baseline with zero
 * annotations and no render-path waterfalls?
 *
 * This analyzer = the detection half. It reuses the EXACT conservative
 * deferral taxonomy of `@pyreon/lint`'s no-eager-import /
 * no-heavy-import-only-in-handler: a heavy `@pyreon/*` import is an
 * auto-split candidate iff EVERY reference to its bindings sits inside a
 * deferred position (JSX on* handler, onMount/onUnmount/onCleanup,
 * dynamic import(), or a timer/IO/idle callback). ANY render-reachable
 * reference disqualifies it (effect/renderEffect run at setup → NOT
 * deferred — same stance as the lint rule). Own-recursion walk because
 * oxc passes no parent.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'oxc-parser'

// Real gzipped weights — lifted from scripts/bundle-budgets.json (the
// repo's locked per-package budget; a stable relative-weight proxy, NOT
// exact main-entry gz — noted as a caveat in RESULTS.md).
const HEAVY_GZ: Record<string, number> = {
  '@pyreon/flow': 15872,
  '@pyreon/code': 7168,
  '@pyreon/document': 3328,
  '@pyreon/document-primitives': 2816,
  '@pyreon/dnd': 2816,
  '@pyreon/charts': 2048,
}
const SPLIT_FLOOR_GZ = 2000 // don't auto-split below ~2KB gz (waterfall guard)

const DEFER_CALLEES = new Set([
  'onMount',
  'onUnmount',
  'onCleanup',
  'setTimeout',
  'setInterval',
  'requestIdleCallback',
  'requestAnimationFrame',
  'queueMicrotask',
  'addEventListener',
])

interface SiteRef {
  file: string
  pkg: string
  bindings: string[]
  deferredRefs: number
  renderRefs: number // > 0 ⇒ NOT a candidate (render-reachable)
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (e !== 'node_modules' && e !== 'dist' && !e.startsWith('.')) walkFiles(p, out)
    } else if (/\.(tsx?|jsx?)$/.test(e) && !/\.(test|spec)\./.test(e)) {
      out.push(p)
    }
  }
  return out
}

function isFn(t: string) {
  return t === 'ArrowFunctionExpression' || t === 'FunctionExpression'
}

/** Recurse `node`, marking child positions deferred. Count refs to
 *  `names` at deferred-depth>0 vs ==0. */
function scan(
  node: any,
  names: Set<string>,
  deferred: boolean,
  acc: { d: number; r: number },
) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const c of node) scan(c, names, deferred, acc)
    return
  }
  const t = node.type

  // Identifier reference to an imported binding (not the import itself,
  // not a member-property name / object-key).
  if (t === 'IdentifierReference' || (t === 'Identifier' && names.has(node.name))) {
    if (names.has(node.name)) {
      if (deferred) acc.d++
      else acc.r++
    }
  }

  // Deferred child positions:
  if (t === 'CallExpression') {
    const callee = node.callee
    const cname =
      callee?.type === 'Identifier' || callee?.type === 'IdentifierReference'
        ? callee.name
        : callee?.type === 'StaticMemberExpression'
          ? callee.property?.name
          : undefined
    const isImportCall = callee?.type === 'Import'
    const calleeDeferred = !!cname && DEFER_CALLEES.has(cname)
    scan(node.callee, names, deferred, acc)
    for (const a of node.arguments ?? []) {
      // args that are functions passed to a defer-callee (or import())
      const argDeferred =
        deferred || isImportCall || (calleeDeferred && isFn(a?.type))
      scan(a, names, argDeferred, acc)
    }
    return
  }

  if (t === 'JSXAttribute') {
    const an = node.name?.name
    const isHandler = typeof an === 'string' && /^on[A-Z]/.test(an)
    scan(node.value, names, deferred || isHandler, acc)
    return
  }

  for (const k in node) {
    if (k === 'type' || k === 'span' || k === 'start' || k === 'end') continue
    scan(node[k], names, deferred, acc)
  }
}

function analyzeFile(file: string, root: string): SiteRef[] {
  const src = readFileSync(file, 'utf8')
  const { program } = parseSync(file, src)
  const refs: SiteRef[] = []
  for (const stmt of program.body ?? []) {
    if (stmt.type !== 'ImportDeclaration') continue
    const pkg = stmt.source?.value
    if (typeof pkg !== 'string' || !(pkg in HEAVY_GZ)) continue
    const bindings = (stmt.specifiers ?? [])
      .map((s: any) => s.local?.name)
      .filter(Boolean)
    if (bindings.length === 0) continue
    const names = new Set<string>(bindings)
    const acc = { d: 0, r: 0 }
    for (const s of program.body ?? []) {
      if (s.type === 'ImportDeclaration') continue
      scan(s, names, false, acc)
    }
    refs.push({
      file: relative(root, file),
      pkg,
      bindings,
      deferredRefs: acc.d,
      renderRefs: acc.r,
    })
  }
  return refs
}

// ── run ──────────────────────────────────────────────────────────────
const repoRoot = process.argv[2] ?? process.cwd()
const appSrc = join(repoRoot, 'examples/app-showcase/src')
const files = walkFiles(appSrc)
const sites = files.flatMap((f) => analyzeFile(f, repoRoot))

const candidates = sites.filter(
  (s) => s.renderRefs === 0 && s.deferredRefs > 0 && HEAVY_GZ[s.pkg] >= SPLIT_FLOOR_GZ,
)
const eagerHeavy = sites.filter((s) => s.renderRefs > 0)

const sum = (xs: SiteRef[]) =>
  xs.reduce((n, s) => n + (HEAVY_GZ[s.pkg] ?? 0), 0)

const report = {
  appSrcFilesScanned: files.length,
  heavyImportSites: sites.length,
  autoSplitCandidates: candidates.map((c) => ({
    file: c.file,
    pkg: c.pkg,
    gz: HEAVY_GZ[c.pkg],
    deferredRefs: c.deferredRefs,
  })),
  eagerHeavySites: eagerHeavy.map((c) => ({
    file: c.file,
    pkg: c.pkg,
    gz: HEAVY_GZ[c.pkg],
    renderRefs: c.renderRefs,
  })),
  projectedInitialBytesRemovableGz: sum(candidates),
  totalHeavyGzReferenced: sum(sites),
}

const outPath = join(
  repoRoot,
  'examples/experiments/autosplit/results/analysis.json',
)
writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
