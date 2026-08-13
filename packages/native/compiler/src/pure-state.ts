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
): string {
  let out = expr
  if (bounds?.min !== undefined) out = `${maxFn}(${out}, ${bounds.min})`
  if (bounds?.max !== undefined) out = `${minFn}(${out}, ${bounds.max})`
  return out
}
