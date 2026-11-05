import { forEachExpr } from './expr-walk'
import { inferReturnType, inferType, type InferenceCtx } from './infer-type'
import type { ComponentIR, DeclIR, ExprIR, StatementIR, TypeIR } from './types'

type FunctionDecl = Extract<DeclIR, { kind: 'function' }>

/**
 * A helper parameter typed `number` takes the int/float storage its CALLERS prove.
 *
 * A TypeScript `number` carries no int/float distinction, so a parameter defaults to `Int` / `Long` — right when
 * nothing says otherwise, and wrong the moment a caller passes a Double: `function fmt(n: number)` called as
 * `fmt(price())` with `const price = signal(2.5)` emitted `func fmt(_ n: Int)` and a call site handing it a
 * `Double`, which compiles on NEITHER target. The annotation is not evidence of integer-ness; it is the absence of
 * any statement about it, and the value at the call site is the statement. (The same rule as the anti-pattern
 * "A type ANNOTATION must never override the evidence sitting beside it", applied to the other end of the call.)
 *
 * Additive by construction: a parameter only ever flips `number → float`, and only on a call that PROVES a Double
 * (an argument whose inferred type is a float number). An unknown argument is no evidence. The pass runs to a
 * fixed point because a widened parameter is itself evidence — `fmt(twice(price()))`, or a helper that forwards its
 * own parameter to another. When a parameter widens, a `number` return is re-inferred from the body, so
 * `function twice(n: number): number { return n * 2 }` stops declaring an `Int` it can no longer return.
 *
 * Integer arguments at the remaining call sites are converted by the existing helper-call coercion, as for a
 * parameter annotated `Double` directly.
 */
export function refineParamFloatsFromCallSites(
  helperFns: readonly FunctionDecl[],
  components: readonly ComponentIR[],
  moduleCtx: InferenceCtx,
  componentCtx: (c: ComponentIR) => InferenceCtx,
): void {
  for (let pass = 0; pass < 8; pass++) {
    // Name → function. A component-local function shadows a module helper of the same name inside that component.
    const moduleFns = new Map(helperFns.map((f) => [f.name, f] as const))
    let changed = false
    const scan = (
      stmts: readonly StatementIR[] | undefined,
      roots: readonly ExprIR[],
      ctx: InferenceCtx,
      fns: ReadonlyMap<string, FunctionDecl>,
    ): void => {
      const visit = (e: ExprIR): void => {
        // `forEachExpr` walks an arrow's expression body only; a block body's statements are walked here.
        if (e.kind === 'arrow' && e.stmts !== undefined && e.stmts.length > 0) {
          walkStatements(e.stmts, visit, ctx)
          return
        }
        if (e.kind !== 'call' || e.callee.kind !== 'identifier') return
        const fn = fns.get(e.callee.name)
        if (fn === undefined) return
        for (let i = 0; i < fn.params.length && i < e.args.length; i++) {
          const p = fn.params[i]!
          if (p.type.kind !== 'number' || p.type.float === true) continue
          const argT = inferType(e.args[i]!, ctx)
          if (argT.kind === 'number' && argT.float === true) {
            p.type = { kind: 'number', float: true }
            widenNumberReturn(fn, ctx)
            changed = true
          }
        }
      }
      for (const r of roots) forEachExpr(r, visit)
      if (stmts !== undefined) walkStatements(stmts, visit, ctx)
    }
    const scanFunction = (fn: FunctionDecl, base: InferenceCtx, fns: ReadonlyMap<string, FunctionDecl>): void => {
      const saved = base.locals
      base.locals = new Map(saved)
      for (const p of fn.params) base.locals.set(p.name, p.type)
      try {
        scan(fn.body, [], base, fns)
      } finally {
        base.locals = saved
      }
    }
    for (const fn of helperFns) scanFunction(fn, moduleCtx, moduleFns)
    for (const c of components) {
      const ctx = componentCtx(c)
      const fns = new Map(moduleFns)
      for (const d of c.decls) if (d.kind === 'function') fns.set(d.name, d)
      const roots: ExprIR[] = [c.returnExpr]
      for (const d of c.decls) {
        if (d.kind === 'function') scanFunction(d, ctx, fns)
        else if (d.kind === 'signal') roots.push(d.initial)
        else if (d.kind === 'computed') {
          if (d.expr !== undefined) roots.push(d.expr)
          if (d.body !== undefined) scan(d.body, [], ctx, fns)
        } else if (d.kind === 'value') roots.push(d.expr)
        else if (d.kind === 'on-mount') scan(d.body, [], ctx, fns)
      }
      scan(undefined, roots, ctx, fns)
    }
    if (!changed) return
  }
}

/** A widened parameter can turn a `number` return fractional (`return n * 2`); re-infer it from the body. */
function widenNumberReturn(fn: FunctionDecl, ctx: InferenceCtx): void {
  if (fn.returnType.kind !== 'number' || fn.returnType.float === true) return
  const inferred = inferReturnType(fn.params, fn.body, ctx)
  if (inferred.kind === 'number' && inferred.float === true) fn.returnType = inferred
}

/**
 * Visit every expression in a statement list, typing each `let` local as it is declared so a later argument that
 * names it (`const p = price(); fmt(p)`) carries its evidence. The locals are restored after the list.
 */
function walkStatements(stmts: readonly StatementIR[], visit: (n: ExprIR) => void, ctx: InferenceCtx): void {
  const saved = ctx.locals
  ctx.locals = new Map(saved)
  try {
    for (const s of stmts) walkStatement(s, visit, ctx)
  } finally {
    ctx.locals = saved
  }
}

function walkStatement(s: StatementIR, visit: (n: ExprIR) => void, ctx: InferenceCtx): void {
  const expr = (e: ExprIR | undefined): void => {
    if (e !== undefined) forEachExpr(e, visit)
  }
  switch (s.kind) {
    case 'let': {
      expr(s.expr)
      const t: TypeIR = s.declaredType ?? inferType(s.expr, ctx)
      if (t.kind !== 'unknown') ctx.locals.set(s.name, t)
      return
    }
    case 'declare':
      ctx.locals.set(s.name, s.declaredType)
      return
    case 'assign':
      expr(s.target)
      expr(s.value)
      return
    case 'if':
      expr(s.cond)
      walkStatements(s.then, visit, ctx)
      if (s.elseBody) walkStatements(s.elseBody, visit, ctx)
      return
    case 'return':
      expr(s.expr)
      return
    case 'expr':
      expr(s.expr)
      return
    case 'while':
    case 'do-while':
      expr(s.cond)
      walkStatements(s.body, visit, ctx)
      return
    case 'for-of': {
      expr(s.iterable)
      // The loop variable carries the iterable's element type into the body, as a `let` would.
      const it = inferType(s.iterable, ctx)
      const saved = ctx.locals
      ctx.locals = new Map(saved)
      if (it.kind === 'array' && it.element.kind !== 'unknown') ctx.locals.set(s.item, it.element)
      try {
        walkStatements(s.body, visit, ctx)
      } finally {
        ctx.locals = saved
      }
      return
    }
    case 'for-range':
      expr(s.from)
      expr(s.to)
      expr(s.step)
      walkStatements(s.body, visit, ctx)
      return
    case 'switch':
      expr(s.discriminant)
      for (const c of s.cases) {
        for (const t of c.tests) expr(t)
        walkStatements(c.body, visit, ctx)
      }
      return
    case 'throw':
      expr(s.message)
      return
    case 'try':
      walkStatements(s.body, visit, ctx)
      if (s.catchBody) walkStatements(s.catchBody, visit, ctx)
      if (s.finallyBody) walkStatements(s.finallyBody, visit, ctx)
      return
    default:
      return
  }
}
