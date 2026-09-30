/**
 * Plain Mode codemod — REAL-CORPUS oracle.
 *
 * Every codemod bug found while migrating the example apps passed the unit
 * specs and the generated-program fuzz, because both only exercise the shapes
 * someone thought to write. This test runs the codemod over REAL classic code —
 * every framework source file in the repo — and checks invariants that must
 * hold for ANY correct conversion, file by file, binding by binding:
 *
 *   classic source O ──migrateToPlain──▶ plain M ──transformPlain──▶ classic B
 *
 * For each converted binding `x`, reference kinds in B must match O exactly
 * where the dialect preserves them, and may only differ in the ways the
 * codemod documents:
 *
 * - identity uses (bare `x`) and signal-API uses (`x.subscribe`, `x.direct`)
 *   are preserved one-for-one — `signalOf(x)` compiles back to `x`;
 * - every write survives: `set(B) === set(O) + update(O)`, and no `.update`,
 *   `.peek` or `x(arg)` remains;
 * - reads never disappear: `read(B) >= read(O) + peek(O)` (`.update` and
 *   `.peek` introduce reads; nothing may remove one). A bare `x` in a JSX
 *   child or DOM attribute counts as a read on both sides — the compiler
 *   auto-calls it in classic code, and plain writes it as the read `x`;
 * - no `x()()` — the signature of an edit dropped inside a rewritten region
 *   (the `.update`-body bug found in the chat example);
 *
 * plus file-level hygiene: B parses, the round trip emits zero plain-mode
 * warnings, M is already plain (idempotence), and every marker / reactivity
 * import M keeps is actually referenced.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSync } from 'oxc-parser'
import { migrateToPlain } from '../plain-migrate'
import { transformPlain } from '../plain'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes
type N = any

const ROOT = join(import.meta.dirname, '../../../../..')

function corpus(): string[] {
  const out = execSync(`git ls-files 'packages/*/*/src/**/*.ts' 'packages/*/*/src/**/*.tsx' 'packages/zero/create-zero/templates/**/*.tsx' 'packages/zero/create-zero/templates/**/*.ts'`, {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => !/\.d\.ts$|\/tests?\/|__tests__|\.test\.|\.spec\.|\/generated|native\/src/.test(f))
}

function langOf(f: string): 'ts' | 'tsx' {
  return f.endsWith('.tsx') ? 'tsx' : 'ts'
}

interface Kinds {
  read: number
  set: number
  update: number
  peek: number
  api: number
  identity: number
  callArgs: number
  doubleCall: number
  /** Bare `x` in a JSX child or DOM-element attribute — the compiler auto-calls it, so it is a READ. */
  jsxRead: number
}
const ZERO = (): Kinds => ({ read: 0, set: 0, update: 0, peek: 0, api: 0, identity: 0, callArgs: 0, doubleCall: 0, jsxRead: 0 })

/** A bare expression container in a JSX child or a DOM (lowercase) element attribute. */
function isDomJsxSlot(container: N): boolean {
  const holder = container.__parent
  if (holder?.type === 'JSXElement' || holder?.type === 'JSXFragment') return true
  if (holder?.type !== 'JSXAttribute') return false
  const name = holder.__parent?.name
  return name?.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)
}

/** Names declared EXACTLY once in the file — the only ones a scope-blind count can attribute. */
function uniqueDeclarations(program: N): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (n: string): void => void counts.set(n, (counts.get(n) ?? 0) + 1)
  const pattern = (p: N): void => {
    if (!p) return
    if (p.type === 'Identifier') add(p.name)
    else if (p.type === 'ObjectPattern') for (const q of p.properties ?? []) pattern(q.type === 'RestElement' ? q.argument : q.value)
    else if (p.type === 'ArrayPattern') for (const e of p.elements ?? []) pattern(e)
    else if (p.type === 'RestElement') pattern(p.argument)
    else if (p.type === 'AssignmentPattern') pattern(p.left)
  }
  const visit = (n: N): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return void n.forEach(visit)
    if (typeof n.type !== 'string') return
    if (n.type === 'VariableDeclarator') pattern(n.id)
    if (/Function/.test(n.type)) {
      if (n.id) pattern(n.id)
      for (const p of n.params ?? []) pattern(p)
    }
    if (n.type === 'ClassDeclaration' && n.id) pattern(n.id)
    if (n.type === 'CatchClause') pattern(n.param)
    if (/^Import(Default|Namespace)?Specifier$/.test(n.type)) pattern(n.local)
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k])
  }
  visit(program)
  return counts
}

/** Classify every reference to each name in `names`. */
function referenceKinds(program: N, names: Set<string>): Map<string, Kinds> {
  const out = new Map<string, Kinds>()
  for (const n of names) out.set(n, ZERO())
  const visit = (n: N, parent: N, key: string): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return void n.forEach((c) => visit(c, parent, key))
    if (typeof n.type !== 'string') return
    if (n.type === 'Identifier' && names.has(n.name)) {
      const k = out.get(n.name)!
      const isNamePosition =
        (parent?.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand) ||
        (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
        (parent?.type === 'VariableDeclarator' && key === 'id') ||
        (parent?.type ?? '').endsWith('Specifier')
      if (!isNamePosition) {
        if (parent?.type === 'CallExpression' && key === 'callee') {
          if ((parent.arguments ?? []).length > 0) k.callArgs++
          else if (parent.__parent?.type === 'CallExpression' && parent.__key === 'callee') k.doubleCall++
          else k.read++
        } else if (parent?.type === 'MemberExpression' && key === 'object' && !parent.computed) {
          const prop = parent.property?.name
          if (prop === 'set') k.set++
          else if (prop === 'update') k.update++
          else if (prop === 'peek') k.peek++
          else k.api++
        } else if (parent?.type === 'JSXExpressionContainer' && isDomJsxSlot(parent)) {
          k.jsxRead++
        } else {
          k.identity++
        }
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'type' || k === 'start' || k === 'end' || k === '__parent' || k === '__key') continue
      const v = n[k]
      if (v && typeof v === 'object') {
        if (!Array.isArray(v) && typeof v.type === 'string') {
          v.__parent = n
          v.__key = k
        } else if (Array.isArray(v)) {
          for (const c of v) if (c && typeof c === 'object' && typeof c.type === 'string') { c.__parent = n; c.__key = k }
        }
        visit(v, n, k)
      }
    }
  }
  visit(program, null, '')
  return out
}

/** Import specifiers from the given sources that are never referenced. */
function unusedImports(program: N, sources: string[]): string[] {
  const locals: string[] = []
  for (const s of program.body) {
    if (s.type !== 'ImportDeclaration' || !sources.includes(s.source.value) || s.importKind === 'type') continue
    for (const sp of s.specifiers ?? []) if (sp.importKind !== 'type') locals.push(sp.local.name)
  }
  if (locals.length === 0) return []
  const used = new Set<string>()
  const visit = (n: N, parent: N, key: string): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return void n.forEach((c) => visit(c, parent, key))
    if (typeof n.type !== 'string' || n.type === 'ImportDeclaration') return
    if ((n.type === 'Identifier' || n.type === 'JSXIdentifier') && !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) && !(parent?.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)) used.add(n.name)
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end' && k !== '__parent' && k !== '__key') visit(n[k], n, k)
  }
  visit(program, null, '')
  return locals.filter((l) => !used.has(l))
}

const parse = (f: string, code: string): N => {
  const r = parseSync(f, code, { sourceType: 'module', lang: langOf(f) })
  return r.errors.length > 0 ? null : r.program
}

describe('Plain Mode codemod — real-corpus oracle', () => {
  const files = corpus()

  it('the corpus is real (guards against an empty walk)', () => {
    expect(files.length).toBeGreaterThan(1000)
  })

  it('every conversion preserves reference semantics and hygiene', { timeout: 300_000 }, () => {
    const failures: string[] = []
    let convertedFiles = 0
    let checkedBindings = 0
    for (const f of files) {
      const O = readFileSync(join(ROOT, f), 'utf8')
      const m = migrateToPlain(O, f)
      if (!m.code) continue
      convertedFiles++
      const fail = (msg: string): void => void failures.push(`${f}: ${msg}`)

      const back = transformPlain(m.code, f)
      if (!back) {
        fail('converted output is not recognised as plain')
        continue
      }
      const warnings = back.warnings.map((w) => w.message)
      if (warnings.length > 0) fail(`round trip emits plain warnings: ${warnings.join(' | ')}`)
      if (!migrateToPlain(m.code, f).alreadyPlain) fail('conversion is not idempotent')

      const oAst = parse(f, O)
      const mAst = parse(f, m.code)
      const bAst = parse(f, back.code)
      if (!mAst || !bAst) {
        fail(`${!mAst ? 'plain' : 'round-tripped'} output does not parse`)
        continue
      }
      const stray = unusedImports(mAst, ['@pyreon/reactivity', '@pyreon/core/plain'])
      if (stray.length > 0) fail(`unused imports left behind: ${stray.join(', ')}`)

      const oDecls = uniqueDeclarations(oAst)
      const bDecls = uniqueDeclarations(bAst)
      const names = new Set(m.converted.filter((n) => oDecls.get(n) === 1 && bDecls.get(n) === 1))
      const oK = referenceKinds(oAst, names)
      const bK = referenceKinds(bAst, names)
      for (const x of names) {
        checkedBindings++
        const o = oK.get(x)!
        const b = bK.get(x)!
        const bad: string[] = []
        if (b.identity !== o.identity) bad.push(`identity ${o.identity}→${b.identity}`)
        if (b.api !== o.api) bad.push(`signal-API ${o.api}→${b.api}`)
        if (b.set !== o.set + o.update) bad.push(`writes ${o.set}+${o.update}→${b.set}`)
        if (b.update || b.peek || b.callArgs) bad.push(`leftover update/peek/call-with-args ${b.update}/${b.peek}/${b.callArgs}`)
        if (b.doubleCall) bad.push(`${b.doubleCall} x()() — a rewrite was dropped`)
        if (b.read + b.jsxRead < o.read + o.peek + o.jsxRead) bad.push(`reads ${o.read}+${o.peek}+${o.jsxRead}→${b.read}+${b.jsxRead}`)
        if (bad.length) fail(`\`${x}\`: ${bad.join('; ')}`)
      }
    }
    // Anti-vacuity: the oracle must actually exercise the codemod.
    expect(convertedFiles, 'corpus files converted (measured 85)').toBeGreaterThanOrEqual(75)
    expect(checkedBindings, 'bindings checked (measured 260)').toBeGreaterThanOrEqual(230)
    expect(failures, failures.slice(0, 20).join('\n')).toEqual([])
  })
})
