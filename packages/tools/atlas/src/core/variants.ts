/**
 * The variant matrix — the cross-product of a component's dimension axes
 * (rocketstyle `state` / `size` / `variant`, or any custom axis). This is the
 * automation kernel: given axes the component already declares, Atlas derives
 * one verified scenario per cell with zero authoring.
 */
import type { Scenario, VariantAxis } from './types'
import { makeScenario } from './scenario'

/**
 * Cross-product of the axes' values.
 *
 * - zero axes → `[{}]` (a single "default" combination),
 * - any axis with zero values is skipped (it cannot contribute a selection).
 */
export function buildVariantMatrix(axes: readonly VariantAxis[]): Record<string, string>[] {
  const usable = axes.filter((a) => a.values.length > 0)
  let combos: Record<string, string>[] = [{}]
  for (const axis of usable) {
    const next: Record<string, string>[] = []
    for (const combo of combos) {
      for (const value of axis.values) {
        next.push({ ...combo, [axis.name]: value })
      }
    }
    combos = next
  }
  return combos
}

/** Human label for a variant selection, e.g. `state=primary · size=large`. */
export function variantLabel(variant: Record<string, string>): string {
  const keys = Object.keys(variant)
  if (keys.length === 0) return 'Default'
  return keys.map((k) => `${k}=${variant[k]}`).join(' · ')
}

/**
 * Derive one scenario per matrix cell. Each variant selection is applied as
 * args (dimension props are plain string props on Pyreon/rocketstyle
 * components) and recorded on `variant` for the UI to group by.
 */
export function autoVariantScenarios(
  component: string,
  axes: readonly VariantAxis[],
  baseArgs: Record<string, unknown> = {},
): Scenario[] {
  const matrix = buildVariantMatrix(axes)
  return matrix.map((variant) => {
    const isDefault = Object.keys(variant).length === 0
    return makeScenario({
      component,
      name: variantLabel(variant),
      args: { ...baseArgs, ...variant },
      variant,
      source: isDefault ? 'auto-default' : 'auto-variant',
    })
  })
}
