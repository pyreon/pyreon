/**
 * The variant scenarios — derived from a component's dimension axes
 * (rocketstyle `state` / `size` / `variant`, or any custom axis). This is the
 * automation kernel: given axes the component already declares, Atlas derives
 * verified scenarios with zero authoring.
 *
 * Two shapes. `axes` (the default) is the ONE-AXIS-AT-A-TIME fan: the default
 * combination (see `defaultCombination`) plus, per axis, each other value with
 * the remaining axes held at their defaults. `full` is the cross-product,
 * `Π|axis|`, plus the default combination when it is not one of its cells. The product was the original default and
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
 * The combination the component renders with when no axis prop is passed:
 * per axis, the component's own default when the scan read one; nothing at
 * all for an optional axis without one (the component decides); the first
 * value only for an axis that must be given (or whose semantics are unknown,
 * e.g. a rocketstyle dimension).
 *
 * It used to be every axis's FIRST value, so a `Button` with
 * `size?: 'sm' | 'md' | 'lg'` rendering `props.size ?? 'md'` got a "Default"
 * of `size: "sm"` (#4365): the order of a union says nothing about defaults.
 */
export function defaultCombination(axes: readonly VariantAxis[]): Record<string, string> {
  const defaults: Record<string, string> = {}
  for (const axis of axes) {
    if (axis.values.length === 0) continue
    if (axis.default !== undefined && axis.values.includes(axis.default)) defaults[axis.name] = axis.default
    else if (axis.optional !== true) defaults[axis.name] = axis.values[0]!
  }
  return defaults
}

const sameCombination = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

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
 * Every combination carries every axis the default combination pins, so a
 * consumer grouping by `variant` sees the same keys as with the product; an
 * optional axis with no known default is left to the component except in the
 * cells that vary it.
 */
export function buildVariantFan(axes: readonly VariantAxis[]): Record<string, string>[] {
  const usable = axes.filter((a) => a.values.length > 0)
  if (usable.length === 0) return [{}]
  const defaults = defaultCombination(usable)
  const combos: Record<string, string>[] = [defaults]
  for (const axis of usable) {
    for (const value of axis.values) {
      if (defaults[axis.name] !== value) combos.push({ ...defaults, [axis.name]: value })
    }
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
  const defaults = defaultCombination(axes)
  let combos: Record<string, string>[]
  if (matrix === 'full') {
    const product = buildVariantMatrix(axes)
    // An unset optional axis makes the default combination a cell the
    // product does not contain; it comes first, as in the fan.
    const index = product.findIndex((c) => sameCombination(c, defaults))
    combos = index === -1 ? [defaults, ...product] : [product[index]!, ...product.filter((_, i) => i !== index)]
  } else {
    combos = buildVariantFan(axes)
  }
  return combos.map((variant) => {
    const isDefault = sameCombination(variant, defaults)
    return makeScenario({
      component,
      name: isDefault ? 'Default' : matrix === 'full' ? variantLabel(variant) : fanLabel(variant, defaults),
      args: { ...baseArgs, ...variant },
      variant,
      source: isDefault ? 'auto-default' : 'auto-variant',
    })
  })
}
