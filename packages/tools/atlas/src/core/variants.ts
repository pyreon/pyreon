/**
 * The variant scenarios — derived from a component's dimension axes
 * (rocketstyle `state` / `size` / `variant`, or any custom axis). This is the
 * automation kernel: given axes the component already declares, Atlas derives
 * verified scenarios with zero authoring.
 *
 * Two shapes. `axes` (the default) is the ONE-AXIS-AT-A-TIME fan: the default
 * combination (every axis at its first value) plus, per axis, each other value
 * with the remaining axes held at their defaults — `Σ|axis|` scenarios. `full`
 * is the cross-product, `Π|axis|`. The product was the original default and
 * it does not survive contact with a real design system: four layout
 * components sharing `indent(5) × gap(5) × gapY(6)` produced 150 scenarios
 * EACH — 600 of a 1,230-scenario catalog, 28% of a 2.5 MB file shipped to the
 * browser, and a sidebar listing 150 near-identical spacing permutations.
 * Axes are independent by construction (a size does not change what a state
 * means), so crossing them verifies nothing the fan does not.
 */
import type { Scenario, VariantAxis } from './types'
import { makeScenario } from './scenario'

/** Which variant scenarios to derive from a component's axes. */
export type VariantMatrix = 'axes' | 'full'

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

/**
 * The one-axis-at-a-time fan: the default combination first, then each axis's
 * non-default values with every other axis at its default.
 *
 * Every combination carries EVERY axis (a scenario is a complete pinned
 * state), so a consumer grouping by `variant` sees the same keys as with the
 * product. With one axis the fan IS the product.
 */
export function buildVariantFan(axes: readonly VariantAxis[]): Record<string, string>[] {
  const usable = axes.filter((a) => a.values.length > 0)
  if (usable.length === 0) return [{}]
  const defaults: Record<string, string> = {}
  for (const axis of usable) defaults[axis.name] = axis.values[0]!
  const combos: Record<string, string>[] = [defaults]
  for (const axis of usable) {
    for (const value of axis.values.slice(1)) combos.push({ ...defaults, [axis.name]: value })
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
 * The label for a fan cell: `Default` for the all-defaults combination, else
 * only the axis that MOVED (`size=large`) — the rest is implied, and a label
 * naming three axes to say one changed reads as three changes.
 */
function fanLabel(variant: Record<string, string>, defaults: Record<string, string>): string {
  const moved: Record<string, string> = {}
  for (const [k, v] of Object.entries(variant)) if (defaults[k] !== v) moved[k] = v
  return variantLabel(moved)
}

/**
 * Derive one scenario per combination. Each variant selection is applied as
 * args (dimension props are plain string props on Pyreon/rocketstyle
 * components) and recorded on `variant` for the UI to group by.
 *
 * The all-defaults combination is named `Default` in BOTH shapes, so the
 * component's default scenario is the one the canvas opens on.
 */
export function autoVariantScenarios(
  component: string,
  axes: readonly VariantAxis[],
  baseArgs: Record<string, unknown> = {},
  matrix: VariantMatrix = 'axes',
): Scenario[] {
  const usable = axes.filter((a) => a.values.length > 0)
  const defaults: Record<string, string> = {}
  for (const axis of usable) defaults[axis.name] = axis.values[0]!
  const combos = matrix === 'full' ? buildVariantMatrix(axes) : buildVariantFan(axes)
  return combos.map((variant) => {
    const isDefault = Object.keys(variant).every((k) => defaults[k] === variant[k])
    return makeScenario({
      component,
      name: isDefault ? 'Default' : matrix === 'full' ? variantLabel(variant) : fanLabel(variant, defaults),
      args: { ...baseArgs, ...variant },
      variant,
      source: isDefault ? 'auto-default' : 'auto-variant',
    })
  })
}
