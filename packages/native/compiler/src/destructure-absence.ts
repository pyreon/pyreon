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
 * The body-local half: each `let x = <indexed read>` in `stmts` whose later uses test `x` for absence, then the inline
 * reads.
 *
 * Uses are resolved by BINDING IDENTITY, not by name: an inner `const v`, a `for (const v of …)`, a `(v) => …`
 * parameter or a `catch (v)` shadows the outer `v`, so a test of the inner one says nothing about the outer read.
 *
 * A destructured element keeps its rule (any test, truthiness included, makes it optional). Any other indexed read
 * becomes optional only when EVERY use of the binding is one the emitters can type as optional — an absence test
 * (`v ?? d`, `v === undefined`, `v?.x`), or a use TypeScript's own flow analysis narrows and both emitters narrow
 * the same way: after an early exit `if (v === undefined) return …` (`break` / `continue` / `throw`), in the
 * `else` of `if (v === undefined)`, the body of `if (v !== undefined)`, or the matching branch of
 * `v === undefined ? a : b`. A use anywhere else (a closure, a mutable binding, an unguarded `v.length` next to a
 * `v ?? d`) keeps the binding a plain subscript — exactly what it compiled to before — and `warn` names it, since
 * natively that read still traps out of range where the web yields `undefined`.
 */
export function applyDestructureAbsenceToLets(stmts: readonly StatementIR[], warn?: (message: string) => void): void {
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!
    if (s.kind !== 'let') continue
    const reads = valueIndexReads(s.expr)
    if (reads.length === 0) continue
    const name = s.name
    const destructured = reads.every((r) => r.destructured === true)
    const uses = bindingUses(stmts.slice(i + 1), name, destructured)
    if (!uses.some((u) => u.tested)) continue
    if (destructured || (s.mutable !== true && uses.every((u) => u.tested || u.guarded))) {
      markTested(new Set(reads))
      continue
    }
    const message =
      `\`${name}\` holds an indexed read and is tested for undefined, but is also used where neither target can narrow it (outside an early \`if (${name} === undefined) return …\` guard, in a closure, or after a reassignment). Natively it stays a plain subscript, which TRAPS out of range where the web yields undefined. Guard every use with an early exit, or default it at the read: \`const ${name} = xs[i] ?? fallback\`.`
    warn?.(message)
  }
  applyDestructureAbsence(stmts)
}

/**
 * `let v = xs[i]; if (v === undefined) v = d` → `let v = xs[i] ?? d`: the default-fill idiom, folded into one
 * declaration. Identical on the web (the `if` assigns exactly when the read was undefined), and natively the binding
 * is then never optional, so every later use reads it as present — as TypeScript does after the fill. Runs before
 * mutability marking, so a binding written only by its fill stays immutable.
 */
export function foldAbsenceDefaults(stmts: StatementIR[]): void {
  for (let i = 0; i + 1 < stmts.length; i++) {
    const s = stmts[i]!
    const next = stmts[i + 1]!
    if (s.kind !== 'let' || valueIndexReads(s.expr).length === 0) continue
    if (next.kind !== 'if' || next.elseBody !== undefined || next.then.length !== 1) continue
    const fill = next.then[0]!
    if (fill.kind !== 'assign' || fill.op !== '=' || fill.target.kind !== 'identifier' || fill.target.name !== s.name) continue
    if (nilTestOf(next.cond, s.name) !== 'absent') continue
    s.expr = { kind: 'logical', op: '??', left: s.expr, right: fill.value }
    stmts.splice(i + 1, 1)
  }
}

interface BindingUse {
  /** The use sits in an absence-testing position. */
  tested: boolean
  /** The use is in a region where the binding is narrowed to present. */
  guarded: boolean
}

/** `e` (through parens) is `name == null` (`present === false`) or `name != null` (`present === true`). */
function nilTestOf(e: ExprIR, name: string): 'absent' | 'present' | null {
  let x = e
  while (x.kind === 'paren') x = x.inner
  if (x.kind !== 'comparison' || (x.op !== '==' && x.op !== '!=')) return null
  const isNull = (y: ExprIR): boolean => y.kind === 'literal' && y.value === null
  const tested = isNull(x.right) ? x.left : isNull(x.left) ? x.right : undefined
  if (tested === undefined || tested.kind !== 'identifier' || tested.name !== name) return null

  return x.op === '==' ? 'absent' : 'present'
}

function alwaysExits(stmts: readonly StatementIR[]): boolean {
  const last = stmts[stmts.length - 1]
  if (last === undefined) return false
  if (last.kind === 'return' || last.kind === 'break' || last.kind === 'continue' || last.kind === 'throw') return true

  return last.kind === 'if' && last.elseBody !== undefined && alwaysExits(last.then) && alwaysExits(last.elseBody)
}

/** Whether a statement list declares `name` itself (it is then a different binding for the whole block). */
function declares(stmts: readonly StatementIR[], name: string): boolean {
  return stmts.some((s) => (s.kind === 'let' || s.kind === 'declare') && s.name === name)
}

/** Every use of the binding `name` in `stmts` (the statements after its declaration), resolved through scopes. */
function bindingUses(stmts: readonly StatementIR[], name: string, truthiness: boolean): BindingUse[] {
  const walker = new BindingUseWalker(name, truthiness)
  walker.list(stmts, false)

  return walker.uses
}

/** A child expression to visit: the node, whether it sits in an absence-testing position, whether it is narrowed. */
type Child = readonly [node: unknown, tested: boolean, guarded: boolean]

/** The scope- and flow-aware walk behind {@link bindingUses}. */
class BindingUseWalker {
  readonly uses: BindingUse[] = []

  constructor(
    private readonly name: string,
    private readonly truthiness: boolean,
  ) {}

  expr(e: unknown, guarded: boolean, tested = false): void {
    if (Array.isArray(e)) {
      for (const x of e) this.expr(x, guarded)
      return
    }
    if (e === null || typeof e !== 'object') return
    const n = e as ExprIR
    if (n.kind === 'identifier') {
      if (n.name === this.name) this.uses.push({ tested, guarded })
      return
    }
    if (n.kind === 'arrow') {
      // A closure runs later, unnarrowed; its own parameter of the same name is another binding.
      if (n.params.includes(this.name)) return
      if (n.stmts !== undefined && n.stmts.length > 0) this.list(n.stmts, false)
      this.expr(n.body, false)

      return
    }
    const children = this.testingChildren(n, guarded, tested) ?? this.narrowingChildren(n, guarded)
    if (children !== undefined) {
      for (const [child, t, g] of children) this.expr(child, g, t)
      return
    }
    for (const [k, v] of Object.entries(n)) if (k !== 'kind') this.expr(v, guarded)
  }

  /** Positions that TEST their subject for absence: `??`, a nil comparison, `?.`, and (destructured) truthiness. */
  private testingChildren(n: ExprIR, guarded: boolean, tested: boolean): readonly Child[] | undefined {
    switch (n.kind) {
      case 'paren':
        return [[n.inner, tested, guarded]]
      case 'logical':
        return [
          [n.left, n.op === '??' || this.truthiness, guarded],
          [n.right, false, guarded],
        ]
      case 'comparison':
        return nilTestOf(n, this.name) === null ? undefined : [[n.left, true, guarded], [n.right, true, guarded]]
      case 'unary':
        return this.truthiness && n.op === '!' ? [[n.argument, true, guarded]] : undefined
      case 'member':
        return n.optional === true ? [[n.object, true, guarded]] : undefined
      case 'index':
        return n.optional === true ? [[n.object, true, guarded], [n.index, false, guarded]] : undefined
      case 'call':
        return n.optional === true ? [[n.callee, true, guarded], [n.args, false, guarded]] : undefined
      default:
        return undefined
    }
  }

  /** `name === undefined ? a : b` narrows the branch TypeScript narrows. */
  private narrowingChildren(n: ExprIR, guarded: boolean): readonly Child[] | undefined {
    if (n.kind !== 'ternary') return undefined
    const t = nilTestOf(n.cond, this.name)

    return [
      [n.cond, this.truthiness && t === null, guarded],
      [n.then, false, guarded || t === 'present'],
      [n.otherwise, false, guarded || t === 'absent'],
    ]
  }

  /**
   * A list is a scope (an own declaration of `name` makes it another binding), and an early-exit guard
   * `if (name === undefined) return …` narrows the rest of the list it sits in.
   */
  list(body: readonly StatementIR[], guardedIn: boolean): void {
    if (declares(body, this.name)) return
    let guarded = guardedIn
    for (const s of body) {
      this.statement(s, guarded)
      const exitGuard = s.kind === 'if' && s.elseBody === undefined && nilTestOf(s.cond, this.name) === 'absent'
      if (exitGuard && alwaysExits(s.then)) guarded = true
    }
  }

  private statement(s: StatementIR, guarded: boolean): void {
    switch (s.kind) {
      case 'if': {
        const t = nilTestOf(s.cond, this.name)
        this.expr(s.cond, guarded, this.truthiness && t === null)
        this.list(s.then, guarded || t === 'present')
        if (s.elseBody) this.list(s.elseBody, guarded || t === 'absent')

        return
      }
      case 'for-of':
      case 'for-range':
        this.expr(s.kind === 'for-of' ? s.iterable : [s.from, s.to, s.step], guarded)
        if (s.item !== this.name) this.list(s.body, guarded)
        return
      case 'try':
        this.list(s.body, guarded)
        if (s.catchBody && s.catchParam !== this.name) this.list(s.catchBody, guarded)
        if (s.finallyBody) this.list(s.finallyBody, guarded)

        return
      case 'switch':
        this.expr(s.discriminant, guarded)
        for (const c of s.cases) {
          this.expr(c.tests, guarded)
          this.list(c.body, guarded)
        }

        return
      case 'while':
      case 'do-while':
        this.expr(s.cond, guarded)
        this.list(s.body, guarded)
        return
      default:
        for (const [k, v] of Object.entries(s)) if (k !== 'kind') this.expr(v, guarded)
    }
  }
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
