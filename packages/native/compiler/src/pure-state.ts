import { inferType, type InferenceCtx } from './infer-type'
import type { ComponentIR, DeclIR, ExprIR } from './types'

/**
 * The member surface of a `useToggle` / `useCounter` binding, rewritten at
 * each use site. Shared so the two targets cannot answer differently — the
 * clamp in particular has to be identical or a counter drifts per platform.
 */
export interface PureStateMembers {
  /** Field the state lives in. */
  field: string
  hook: 'useToggle' | 'useCounter'
  bounds?: { min?: number; max?: number }
}

/** Resolve hook metadata within one component's lexical scope. */
export function pureStateBindings(
  decls: readonly DeclIR[],
): Map<string, Extract<DeclIR, { kind: 'pure-state' }>> {
  const bindings = new Map<string, Extract<DeclIR, { kind: 'pure-state' }>>()
  for (const decl of decls) {
    if (decl.kind === 'pure-state') bindings.set(decl.name, decl)
  }
  return bindings
}

/**
 * Wrap `expr` in the counter's literal clamp. Emitted per mutation rather
 * than held in a helper so the arithmetic is visible in the output and needs
 * no runtime.
 */
export function clampExpr(
  expr: string,
  bounds: { min?: number; max?: number } | undefined,
  minFn: string,
  maxFn: string,
  /** Kotlin integer literals are `Long` (`mutableStateOf(0L)`), and `maxOf`/`minOf`
   *  have no mixed Long/Int overload — the bound must carry the width too. */
  intSuffix = '',
): string {
  const lit = (n: number): string =>
    `${n}${Number.isInteger(n) && !(intSuffix === '.0' && /e/i.test(String(n))) ? intSuffix : ''}`
  let out = expr
  if (bounds?.min !== undefined) out = `${maxFn}(${out}, ${lit(bounds.min)})`
  if (bounds?.max !== undefined) out = `${minFn}(${out}, ${lit(bounds.max)})`
  return out
}

/** Widen counter storage from its complete numeric evidence before either target emits it. */
export function refinePureStateNumbers(component: ComponentIR, inference: InferenceCtx): void {
  const counters = new Map(
    component.decls
      .filter(
        (d): d is Extract<DeclIR, { kind: 'pure-state' }> =>
          d.kind === 'pure-state' && typeof d.initial === 'number',
      )
      .map((d) => [d.name, d]),
  )
  if (counters.size === 0) return
  for (const counter of counters.values()) {
    if (
      (typeof counter.initial === 'number' && !Number.isSafeInteger(counter.initial)) ||
      (counter.bounds?.min !== undefined && !Number.isSafeInteger(counter.bounds.min)) ||
      (counter.bounds?.max !== undefined && !Number.isSafeInteger(counter.bounds.max))
    )
      counter.floating = true
  }
  const visit = (value: unknown, ctx: InferenceCtx): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, ctx)
      return
    }
    if (value === null || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if (node.kind === 'function') {
      const fn = value as Extract<DeclIR, { kind: 'function' }>
      ctx = {
        ...ctx,
        locals: new Map([...ctx.locals, ...fn.params.map((p) => [p.name, p.type] as const)]),
      }
    }
    if (node.kind === 'call') {
      const call = value as Extract<ExprIR, { kind: 'call' }>
      if (
        call.callee.kind === 'member' &&
        call.callee.object.kind === 'identifier' &&
        ['inc', 'dec', 'set'].includes(call.callee.property)
      ) {
        const counter = counters.get(call.callee.object.name)
        const arg = call.args[0]
        if (counter !== undefined && arg !== undefined) {
          const type = inferType(arg, ctx)
          if (
            (type.kind === 'number' && type.float === true) ||
            (arg.kind === 'literal' &&
              typeof arg.value === 'number' &&
              !Number.isSafeInteger(arg.value))
          )
            counter.floating = true
        }
      }
    }
    for (const child of Object.values(node)) visit(child, ctx)
  }
  visit(component, inference)
}

/** Kotlin's numeric literal spelling for the selected counter storage type. */
export function kotlinCounterLiteral(
  value: number | boolean,
  floating: boolean | undefined,
): string {
  const text = String(value)
  if (typeof value !== 'number' || !Number.isInteger(value)) return text
  return floating === true ? (/e/i.test(text) ? text : `${text}.0`) : `${text}L`
}
