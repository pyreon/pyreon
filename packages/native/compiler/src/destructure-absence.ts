import type { ExprIR, StatementIR, TypeIR } from './types'

/**
 * An indexed read the source tests for absence is a bounds-checked, OPTIONAL read natively — as `undefined` is on the
 * web.
 *
 * `xs[i]` lowers to a native subscript, which TRAPS out of range where the web yields `undefined` and carries on. The
 * nil-safe lowering exists: the OPTIONAL index (`xs?.[i]`) emits `(xs.indices.contains(i) ? xs[i] : nil)` (or the
 * runtime's single-evaluation `pyreonAt(xs, i)`) / `xs.getOrNull(i)` and types `T | undefined`.
 *
 * It applies where the code TESTS the read for absence, because that is where the web's `undefined` is observable and
 * handled:
 *
 * - **Any indexed read** (`xs[i]`, `rows[r][c]`) used as `xs[i] ?? fallback`, compared with `undefined` / `null`, or
 *   read through `xs[i]?.x` — directly, or through a `const v = xs[i]` whose later uses do so. Before this the read was
 *   a plain subscript, so on native the guard was dead code AFTER a trap: `const s = series[k]; if (s === undefined)
 *   return []` crashed on an out-of-range `k` (both targets) where the web returned `[]`, and the dead guard surfaced as
 *   swiftc's "comparing non-optional value to 'nil' always returns false" / kotlinc's "condition is always 'false'". Only
 *   a read whose receiver infers as an ARRAY becomes optional (`indexReadsOptionally`): a `Record` / `Map` subscript is
 *   already optional natively and a string index has its own lowering.
 * - **An array-destructured element** (`const [first] = xs`, flagged `destructured`) additionally in a TRUTHINESS
 *   position (`!first`, `if (first)`, `first && …`, `first || d`). A plain indexed read in a truthiness position stays a
 *   subscript: `if (flags[i])` over a `boolean[]` tests the value, and the parse cannot tell it from an object array.
 *
 * A read the code only ever uses as a present value (`const [r, g, b] = rgb; return r * 0.3 + …`, `xs[i] * 2`, the
 * dominant shape) stays a plain subscript: TypeScript types it `T` (without `noUncheckedIndexedAccess`), dereferencing
 * it when absent fails on the web as well, and typing it optional would turn every such read into a native compile
 * error. A local tested in one place and used unguarded in another is optional natively, so the unguarded use must be
 * narrowed as it would be under `noUncheckedIndexedAccess`.
 */

type Node = Record<string, unknown> & { kind?: string }

/** Whether `e` (unwrapping parens) satisfies `pred`. */
function subject(e: unknown, pred: (e: ExprIR) => boolean): boolean {
  let cur = e as Node | undefined
  while (cur?.kind === 'paren') cur = cur.inner as Node | undefined
  return cur !== undefined && cur.kind !== undefined && pred(cur as unknown as ExprIR)
}

function isNullLiteral(e: unknown): boolean {
  let cur = e as Node | undefined
  while (cur?.kind === 'paren') cur = cur.inner as Node | undefined
  return cur?.kind === 'literal' && cur.value === null
}

/**
 * Every node satisfying `pred` that sits in an absence-testing position anywhere in `root`. Arrows that rebind a
 * name are not special-cased: `pred` decides what counts as the subject.
 */
function absenceTested(
  root: unknown,
  pred: (e: ExprIR) => boolean,
  out: Set<unknown>,
  truthiness: boolean,
): void {
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) visit(x)
      return
    }
    if (n === null || typeof n !== 'object') return
    const node = n as Node
    const mark = (child: unknown): void => {
      let cur = child as Node | undefined
      while (cur?.kind === 'paren') cur = cur.inner as Node | undefined
      if (subject(cur, pred)) out.add(cur)
    }
    switch (node.kind) {
      case 'logical':
        // `x ?? d` tests the left operand for absence; `x || d` / `x && x.y` test its truthiness.
        if (node.op === '??' || truthiness) mark(node.left)
        break
      case 'comparison':
        if ((node.op === '==' || node.op === '!=') && isNullLiteral(node.right)) mark(node.left)
        if ((node.op === '==' || node.op === '!=') && isNullLiteral(node.left)) mark(node.right)
        break
      case 'unary':
        if (truthiness && node.op === '!') mark(node.argument)
        break
      case 'ternary':
      case 'if':
      case 'while':
      case 'do-while':
        if (truthiness) mark(node.cond)
        break
      case 'member':
      case 'index':
        if (node.optional === true) mark(node.object)
        break
      case 'call':
        if (node.optional === true) mark(node.callee)
        break
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'kind') visit(v)
  }
  visit(root)
}

function isDestructuredIndex(e: ExprIR): boolean {
  return e.kind === 'index' && e.destructured === true
}

function isIndex(e: ExprIR): boolean {
  return e.kind === 'index'
}

type IndexExpr = Extract<ExprIR, { kind: 'index' }>

/**
 * Whether an indexed read lowers to the bounds-checked optional read: the source's own `xs?.[i]`, or a read the
 * source tests for absence (`absenceTested`) on an ARRAY receiver. The one rule the inference and both emitters share,
 * so the type a read is given and the code it emits cannot disagree.
 */
export function indexReadsOptionally(e: IndexExpr, receiverType: TypeIR): boolean {
  return e.optional === true || (e.absenceTested === true && receiverType.kind === 'array')
}

function markTested(tested: Set<unknown>): void {
  for (const n of tested) {
    const idx = n as IndexExpr
    if (idx.destructured === true) idx.optional = true
    else idx.absenceTested = true
  }
}

/**
 * Mark the indexed reads in `root` that sit in an absence-testing position: every destructured element (truthiness
 * included), and every other indexed read under `??`, a `null` / `undefined` comparison or `?.`. Covers the
 * component-scope destructure too, which inlines the element read at every use site.
 */
export function applyDestructureAbsence(root: unknown): void {
  const destructured = new Set<unknown>()
  absenceTested(root, isDestructuredIndex, destructured, true)
  const indexed = new Set<unknown>()
  absenceTested(root, isIndex, indexed, false)
  markTested(destructured)
  markTested(indexed)
}

/**
 * The body-local half: each `let x = <indexed read>` in `stmts` whose later uses test `x` for absence (any test for a
 * destructured element; `??`, a nullish comparison or `?.` for any other indexed read), then the inline reads.
 */
export function applyDestructureAbsenceToLets(stmts: readonly StatementIR[]): void {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!
    if (s.kind !== 'let') continue
    const reads = valueIndexReads(s.expr)
    if (reads.length === 0) continue
    const name = s.name
    const destructured = reads.every((r) => r.destructured === true)
    const tested = new Set<unknown>()
    absenceTested(stmts.slice(i + 1), (e) => e.kind === 'identifier' && e.name === name, tested, destructured)
    if (tested.size === 0) continue
    markTested(new Set(reads))
  }
  applyDestructureAbsence(stmts)
}

/**
 * The indexed reads that can BE the value of `e`: `e` itself, or every leaf of a ternary (`n > 0 ? xs[0] : ys[i]`),
 * through parens — empty unless EVERY leaf is one. A local bound to them is absent exactly when the read that
 * produced it was.
 */
function valueIndexReads(e: ExprIR): IndexExpr[] {
  if (e.kind === 'paren') return valueIndexReads(e.inner)
  if (e.kind === 'index') return [e]
  if (e.kind === 'ternary') {
    const a = valueIndexReads(e.then)
    const b = valueIndexReads(e.otherwise)
    return a.length > 0 && b.length > 0 ? [...a, ...b] : []
  }

  return []
}
