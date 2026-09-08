import type { RuleMeta, ScanTarget } from '../types'

/**
 * The file surfaces a rule is ABOUT, always as a list.
 *
 * `RuleMeta.scanTarget` accepts a bare value or a list, and absent means
 * `source`. Every consumer needs the same three-way answer, so it is resolved
 * ONCE here rather than at each `=== target` comparison — a `scanTarget`
 * declared as a list and compared with `===` silently matches nothing, which
 * is the same shape of silent hole the field was introduced to close.
 */
export const scanTargetsOf = (meta: Pick<RuleMeta, 'scanTarget'>): readonly ScanTarget[] => {
  const t = meta.scanTarget
  if (t === undefined) return ['source']
  return Array.isArray(t) ? t : [t as ScanTarget]
}

/** True when `rule` is about `target`. */
export const targetsScan = (
  meta: Pick<RuleMeta, 'scanTarget'>,
  target: ScanTarget,
): boolean => scanTargetsOf(meta).includes(target)
