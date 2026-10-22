// Expected-type propagation of `Double` onto integer literals.
//
// JS has one number type; the native targets split Int and Double, and an
// integer-valued literal is read as an Int. That is right with no other evidence
// and wrong the moment the literal sits where a Double is EXPECTED, because
// Kotlin does not coerce an integer literal into a Double (`val x: Double = 0L`,
// `half(0L)`, `listOf(0L, 1L)` as `List<Double>`, `a ?: 0L` against a `Double?`
// are all type errors) and Swift, which does coerce a literal, still loses the
// annotation on a local (`const x: Double = 0` emits `let x = 0`, an Int, and a
// later `half(x)` fails). Each of these used to need its own special case.
//
// The rule is one thing: where a Double is declared or required, an integer
// literal in that position is a Double. Flagging it `float` makes both emitters
// print `0.0`, which is valid on both targets and types the binding correctly
// everywhere it is later read.
//
// Strictly ADDITIVE, like every refinement beside it: it only ever sets `float`
// on an integer literal, and only in a position whose type is a Double by
// declaration or by the other side of a `??` being one. An Int context is never
// touched.

import { forEachExpr } from './expr-walk'
import { inferType, type InferenceCtx } from './infer-type'
import type { ComponentIR, DeclIR, ExprIR, ModuleDeclIR, StatementIR, TypeIR } from './types'

type FunctionDecl = Extract<DeclIR, { kind: 'function' }>

/** `Double` as written (`type Double = number` is the documented cross-target alias) or as inferred. */
function isDouble(t: TypeIR | undefined): boolean {
  if (t === undefined) return false
  if (t.kind === 'number') return t.float === true
  return t.kind === 'typeRef' && t.name === 'Double' && t.args.length === 0
}

function isDoubleArray(t: TypeIR | undefined): boolean {
  return t !== undefined && t.kind === 'array' && isDouble(t.element)
}

/** Flag every integer literal that sits in an expression position of an expected Double. */
function expectDouble(e: ExprIR): void {
  switch (e.kind) {
    case 'literal':
      if (typeof e.value === 'number' && Number.isInteger(e.value)) e.float = true
      return
    case 'unary':
      if (e.op === '-' || e.op === '+') expectDouble(e.argument)
      return
    case 'ternary':
      expectDouble(e.then)
      expectDouble(e.otherwise)
      return
    case 'logical':
      // `a ?? 0` / `a || 0` yield one of the two operands, so both sit in the expected position.
      if (e.op === '??' || e.op === '||') {
        expectDouble(e.left)
        expectDouble(e.right)
      }
      return
    default:
      return
  }
}

function expectDoubleArray(e: ExprIR): void {
  if (e.kind === 'array') for (const el of e.elements) expectDouble(el)
}

/** Apply `expected` to `e`: a Double scalar or a Double array. */
function expectType(e: ExprIR, expected: TypeIR | undefined): void {
  if (isDouble(expected)) expectDouble(e)
  else if (isDoubleArray(expected)) expectDoubleArray(e)
}

/** Every statement list nested directly in `s`. */
function nestedBodies(s: StatementIR): StatementIR[][] {
  switch (s.kind) {
    case 'if':
      return s.elseBody ? [s.then, s.elseBody] : [s.then]
    case 'while':
    case 'for-of':
    case 'for-range':
    case 'do-while':
      return [s.body]
    case 'switch':
      return s.cases.map((c) => c.body)
    default:
      return []
  }
}

/** Every expression a statement owns directly (not those inside nested bodies). */
function statementExprs(s: StatementIR): ExprIR[] {
  switch (s.kind) {
    case 'let':
      return [s.expr]
    case 'assign':
      return [s.target, s.value]
    case 'return':
      return s.expr ? [s.expr] : []
    case 'expr':
      return [s.expr]
    case 'if':
    case 'while':
    case 'do-while':
      return [s.cond]
    case 'for-of':
      return [s.iterable]
    case 'for-range':
      return s.step ? [s.from, s.to, s.step] : [s.from, s.to]
    case 'switch':
      return [s.discriminant, ...s.cases.flatMap((c) => c.tests)]
    default:
      return []
  }
}

function forEachStatement(body: StatementIR[], visit: (s: StatementIR) => void): void {
  for (const s of body) {
    visit(s)
    for (const nested of nestedBodies(s)) forEachStatement(nested, visit)
  }
}

export interface ContextualDoubleInput {
  components: ComponentIR[]
  /** File-scope helper functions. */
  helperFns: FunctionDecl[]
  moduleDecls: ModuleDeclIR[]
  /** The inference context for a component's body; `null` for file scope. */
  inferenceCtx: (component: ComponentIR | null) => InferenceCtx
}

/** The pass. Run after every other float refinement, so declared and inferred types are final. */
export function widenLiteralsInDoubleContexts(input: ContextualDoubleInput): void {
  for (const md of input.moduleDecls) expectType(md.initial, md.type)

  const fileScopeSignatures = new Map<string, FunctionDecl>()
  for (const fn of input.helperFns) fileScopeSignatures.set(fn.name, fn)

  const apply = (
    fns: FunctionDecl[],
    bodies: StatementIR[][],
    exprs: ExprIR[],
    ctx: InferenceCtx,
    local: Map<string, FunctionDecl>,
  ): void => {
    // A parameter default is a Double literal where the parameter is a Double.
    for (const fn of fns) {
      for (const p of fn.params) if (p.defaultValue) expectType(p.defaultValue, p.type)
      forEachStatement(fn.body, (s) => {
        if (s.kind === 'return' && s.expr) expectType(s.expr, fn.returnType)
      })
    }
    const visitExpr = (root: ExprIR): void => {
      forEachExpr(root, (e) => {
        if (e.kind === 'call' && e.callee.kind === 'identifier') {
          const sig = local.get(e.callee.name) ?? fileScopeSignatures.get(e.callee.name)
          if (sig) {
            for (let i = 0; i < e.args.length && i < sig.params.length; i++) {
              expectType(e.args[i] as ExprIR, sig.params[i]!.type)
            }
          }
        } else if (e.kind === 'logical' && e.op === '??') {
          // The other side decides: `geo.latitude ?? 0` is a Double expression when the
          // left infers Double, whatever the enclosing context says.
          const left = inferType(e.left, ctx)
          if (left.kind === 'number' && left.float === true) expectDouble(e.right)
        }
      })
    }
    for (const exprRoot of exprs) visitExpr(exprRoot)
    for (const body of bodies) {
      forEachStatement(body, (s) => {
        if (s.kind === 'let') expectType(s.expr, s.declaredType)
        for (const e of statementExprs(s)) visitExpr(e)
      })
    }
  }

  // File-scope helpers see no component context.
  apply(input.helperFns, input.helperFns.map((f) => f.body), [], input.inferenceCtx(null), new Map())

  for (const component of input.components) {
    const ctx = input.inferenceCtx(component)
    const fns = component.decls.filter((d): d is FunctionDecl => d.kind === 'function')
    const local = new Map(fns.map((f) => [f.name, f] as const))
    const exprs: ExprIR[] = [component.returnExpr]
    const bodies: StatementIR[][] = fns.map((f) => f.body)
    for (const d of component.decls) {
      if (d.kind === 'signal') {
        expectType(d.initial, d.type)
        exprs.push(d.initial)
      } else if (d.kind === 'value') {
        expectType(d.expr, d.type)
        exprs.push(d.expr)
      } else if (d.kind === 'computed') {
        if (d.expr) exprs.push(d.expr)
        if (d.body) bodies.push(d.body)
      } else if (d.kind === 'on-mount') {
        bodies.push(d.body)
      }
    }
    apply(fns, bodies, exprs, ctx, local)
  }
}
