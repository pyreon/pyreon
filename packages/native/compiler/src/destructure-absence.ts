import type { ExprIR, StatementIR } from './types'

/**
 * An array-destructured element read past the end of the array is `undefined` on the web — and a trap natively.
 *
 * `const [first] = xs` lowers to `first = xs[0]`, a native subscript, which crashes on an empty array where the web
 * binds `undefined` and carries on. The nil-safe lowering already exists: the OPTIONAL index (`xs?.[0]`) emits
 * `(xs.indices.contains(0) ? xs[0] : nil)` / `xs.getOrNull(0)` and types `T | undefined`.
 *
 * It is applied where the code TESTS the element for absence — `first ?? fallback`, `first === undefined`, `!first`,
 * `if (first)`, `first?.x` — because that is where the web's `undefined` is observable and handled. An element the
 * code only ever uses as a present value (`const [r, g, b] = rgb; return r * 0.3 + …`, the dominant shape) stays a
 * plain subscript: TypeScript types it `T` (without `noUncheckedIndexedAccess`), dereferencing it when absent fails
 * on the web as well, and typing it optional would turn every such read into a native compile error. That residual
 * is deliberate — an element used both ways (`first ?? 'x'` and later an unguarded `first.length`) is optional
 * natively, so the unguarded read must be narrowed as it would under `noUncheckedIndexedAccess`.
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
function absenceTested(root: unknown, pred: (e: ExprIR) => boolean, out: Set<unknown>): void {
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
        // `x ?? d`, `x || d`, `x && x.y` — the left operand is tested.
        mark(node.left)
        break
      case 'comparison':
        if ((node.op === '==' || node.op === '!=') && isNullLiteral(node.right)) mark(node.left)
        if ((node.op === '==' || node.op === '!=') && isNullLiteral(node.left)) mark(node.right)
        break
      case 'unary':
        if (node.op === '!') mark(node.argument)
        break
      case 'ternary':
      case 'if':
      case 'while':
      case 'do-while':
        mark(node.cond)
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

/**
 * Make each destructured element read optional where it is tested for absence. Covers both lowerings: a
 * component-scope destructure inlines the element read at every use site (so the read itself is what sits in the
 * testing position), and a function-body destructure binds a `let` whose later uses are tested.
 */
export function applyDestructureAbsence(root: unknown): void {
  const tested = new Set<unknown>()
  absenceTested(root, isDestructuredIndex, tested)
  for (const n of tested) (n as { optional?: boolean }).optional = true
}

/** The body-local half: each `let x = <destructured element>` in `stmts` whose later uses test `x` for absence. */
export function applyDestructureAbsenceToLets(stmts: readonly StatementIR[]): void {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!
    if (s.kind !== 'let' || s.expr.kind !== 'index' || s.expr.destructured !== true) continue
    const name = s.name
    const tested = new Set<unknown>()
    absenceTested(stmts.slice(i + 1), (e) => e.kind === 'identifier' && e.name === name, tested)
    if (tested.size > 0) s.expr.optional = true
  }
  applyDestructureAbsence(stmts)
}
