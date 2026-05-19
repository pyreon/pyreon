/**
 * auto-split experiment — static reachability analyzer (v1 + v2).
 *
 * v1 = LEXICAL: a heavy ref is "deferred" only if it is lexically inside
 *      a deferred wrapper (on* JSX handler arrow / onMount-family / timer
 *      / idle / microtask / .then / import() thunk).
 * v2 = CALL-GRAPH: additionally, a module-scope function whose EVERY
 *      reference is itself a deferred wrapper (transitively) is
 *      "deferred-only"; heavy refs inside such a function count as
 *      deferred. This catches the dominant real pattern —
 *      `async function exportAs(){ download(...) }` invoked only from
 *      `onClick={() => exportAs()}` — which v1 cannot.
 *
 * oxc Visitor passes no parent (repo-known gotcha) → manual recursion
 * with an ancestor stack. Conservative by construction: one render-path
 * use of a heavy binding (or of an enclosing fn) disqualifies the module.
 *
 * Run: bun examples/experiments/auto-split/analyze.ts [targetDir]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSync } from 'oxc-parser'
import { GROUND_TRUTH } from './ground-truth'

const HEAVY_PACKAGES = new Set([
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/document',
  '@pyreon/flow',
])
const DEFERRED_CALLEES = new Set([
  'onMount',
  'onUnmount',
  'onCleanup',
  'setTimeout',
  'setInterval',
  'requestIdleCallback',
  'requestAnimationFrame',
  'queueMicrotask',
  'lazy',
])

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walkFiles(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(p)
  }
  return out
}

/** Lexical: is some ancestor frame a deferred wrapper? */
function lexDeferred(stack: any[]): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const n = stack[i]
    const child = stack[i + 1]
    if (!n) continue
    if (
      (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') &&
      stack[i - 1]?.type === 'JSXExpressionContainer' &&
      stack[i - 2]?.type === 'JSXAttribute' &&
      typeof stack[i - 2]?.name?.name === 'string' &&
      /^on[A-Z]/.test(stack[i - 2].name.name)
    )
      return true
    if (n.type === 'CallExpression' && child && Array.isArray(n.arguments) && n.arguments.includes(child)) {
      const c = n.callee
      const name =
        c?.type === 'Identifier'
          ? c.name
          : c?.type === 'MemberExpression' && c.property?.type === 'Identifier'
            ? c.property.name
            : ''
      if (DEFERRED_CALLEES.has(name) || name === 'then' || name === 'catch') return true
    }
    if (n.type === 'ImportExpression') return true
  }
  return false
}

/** Nearest enclosing named function binding for the current stack, or null. */
function enclosingFn(stack: any[]): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const n = stack[i]
    if (n?.type === 'FunctionDeclaration' && n.id?.name) return n.id.name
    if (
      (n?.type === 'ArrowFunctionExpression' || n?.type === 'FunctionExpression') &&
      stack[i - 1]?.type === 'VariableDeclarator' &&
      stack[i - 1].id?.type === 'Identifier'
    )
      return stack[i - 1].id.name
  }
  return null
}

interface Mod {
  file: string
  heavyLocals: Set<string>
  heavyRefs: { name: string; lex: boolean; encFn: string | null }[]
  fnRefs: { name: string; lex: boolean; encFn: string | null }[]
  fnDecls: Set<string>
}

function analyze(abs: string, root: string): Mod | null {
  const src = readFileSync(abs, 'utf8')
  const { program } = parseSync(abs, src)
  const heavyLocals = new Set<string>()
  for (const node of program.body as any[]) {
    if (node.type !== 'ImportDeclaration' || !HEAVY_PACKAGES.has(node.source?.value)) continue
    if (node.importKind === 'type') continue
    for (const s of node.specifiers ?? [])
      if (s.importKind !== 'type' && s.local?.name) heavyLocals.add(s.local.name)
  }
  if (!heavyLocals.size) return null

  const fnDecls = new Set<string>()
  const heavyRefs: Mod['heavyRefs'] = []
  const fnRefs: Mod['fnRefs'] = []
  const declIdents = new Set<any>()
  const stack: any[] = []

  const visit = (node: any) => {
    if (!node || typeof node.type !== 'string') return
    stack.push(node)
    if (node.type === 'ImportDeclaration')
      for (const s of node.specifiers ?? []) declIdents.add(s.local)
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      fnDecls.add(node.id.name)
      declIdents.add(node.id)
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
    ) {
      fnDecls.add(node.id.name)
      declIdents.add(node.id)
    }
    if (node.type === 'Identifier' && !declIdents.has(node)) {
      const p = stack[stack.length - 2]
      const isMember = p?.type === 'MemberExpression' && p.property === node && !p.computed
      const isKey = p?.type === 'Property' && p.key === node && !p.computed
      // exclude the import-specifier identifiers (`imported`/`local`):
      // `import { download }` must not count as a render-path use.
      const isImport = typeof p?.type === 'string' && p.type.startsWith('Import')
      if (!isMember && !isKey && !isImport) {
        const rec = { name: node.name, lex: lexDeferred(stack), encFn: enclosingFn(stack) }
        if (heavyLocals.has(node.name)) heavyRefs.push(rec)
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range' || k === 'parent') continue
      const v = node[k]
      if (Array.isArray(v)) for (const c of v) visit(c)
      else if (v && typeof v.type === 'string') visit(v)
    }
    stack.pop()
  }
  visit(program)

  // second pass: references to LOCAL function bindings (for v2 fixpoint)
  const declSet2 = new Set<any>()
  const stack2: any[] = []
  const visit2 = (node: any) => {
    if (!node || typeof node.type !== 'string') return
    stack2.push(node)
    if (node.type === 'FunctionDeclaration' && node.id) declSet2.add(node.id)
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression')
    )
      declSet2.add(node.id)
    if (node.type === 'Identifier' && fnDecls.has(node.name) && !declSet2.has(node)) {
      const p = stack2[stack2.length - 2]
      const isMember = p?.type === 'MemberExpression' && p.property === node && !p.computed
      if (!isMember)
        fnRefs.push({ name: node.name, lex: lexDeferred(stack2), encFn: enclosingFn(stack2) })
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range' || k === 'parent') continue
      const v = node[k]
      if (Array.isArray(v)) for (const c of v) visit2(c)
      else if (v && typeof v.type === 'string') visit2(v)
    }
    stack2.pop()
  }
  visit2(program)

  return { file: relative(root, abs), heavyLocals, heavyRefs, fnRefs, fnDecls }
}

/** v2: fixpoint — a fn is deferred-only iff every ref is lexically
 *  deferred OR enclosed in a deferred-only fn (and it has ≥1 ref). */
function deferredOnlyFns(m: Mod): Set<string> {
  const refsByFn = new Map<string, { lex: boolean; encFn: string | null }[]>()
  for (const f of m.fnDecls) refsByFn.set(f, [])
  for (const r of m.fnRefs) refsByFn.get(r.name)?.push({ lex: r.lex, encFn: r.encFn })
  const deferred = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const [fn, refs] of refsByFn) {
      if (deferred.has(fn) || refs.length === 0) continue
      if (refs.every((r) => r.lex || (r.encFn && deferred.has(r.encFn)))) {
        deferred.add(fn)
        changed = true
      }
    }
  }
  return deferred
}

function classify(m: Mod) {
  const v1Refs = m.heavyRefs.map((r) => r.lex)
  const v1 = m.heavyRefs.length > 0 && v1Refs.every(Boolean)
  const dofns = deferredOnlyFns(m)
  const v2Refs = m.heavyRefs.map((r) => r.lex || (r.encFn ? dofns.has(r.encFn) : false))
  const v2 = m.heavyRefs.length > 0 && v2Refs.every(Boolean)
  return { v1, v2 }
}

function metrics(detected: Set<string>) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0
  for (const [file, g] of Object.entries(GROUND_TRUTH)) {
    const d = detected.has(file)
    if (g.label === 'split' && d) tp++
    else if (g.label === 'split' && !d) fn++
    else if (g.label === 'keep' && d) fp++
    else tn++
  }
  const precision = tp + fp === 0 ? null : +(tp / (tp + fp)).toFixed(3)
  const recall = tp + fn === 0 ? null : +(tp / (tp + fn)).toFixed(3)
  return { tp, fp, fn, tn, precision, recall }
}

const target = process.argv[2] ?? 'examples/app-showcase/src'
const root = process.cwd()
const mods = walkFiles(join(root, target))
  .map((f) => analyze(f, root))
  .filter((m): m is Mod => m !== null)

if (process.env.DEBUG_FILE) {
  const m = mods.find((x) => x.file.includes(process.env.DEBUG_FILE!))
  if (m)
    console.error(
      JSON.stringify(
        {
          file: m.file,
          fnDecls: [...m.fnDecls],
          fnRefs: m.fnRefs,
          heavyRefs: m.heavyRefs,
          deferredOnlyFns: [...deferredOnlyFns(m)],
        },
        null,
        2,
      ),
    )
}

const v1set = new Set<string>()
const v2set = new Set<string>()
const detail = mods.map((m) => {
  const c = classify(m)
  if (c.v1) v1set.add(m.file)
  if (c.v2) v2set.add(m.file)
  return { file: m.file, heavyRefs: m.heavyRefs.length, v1: c.v1, v2: c.v2 }
})

console.log(
  JSON.stringify(
    {
      target,
      baseline: '259b46e76',
      heavyImportingModules: mods.length,
      v1: { candidates: [...v1set], ...metrics(v1set) },
      v2: { candidates: [...v2set], ...metrics(v2set) },
      groundTruthSplit: Object.entries(GROUND_TRUTH)
        .filter(([, g]) => g.label === 'split')
        .map(([f]) => f),
      detail,
    },
    null,
    2,
  ),
)
