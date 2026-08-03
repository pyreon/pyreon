/**
 * Built-in: auto variant-matrix generation. The automation kernel expressed as
 * a plugin — given a component that declares axes (rocketstyle
 * state/size/variant, or custom), it appends one derived scenario per matrix
 * cell. Existing scenarios (by id) always win, so an authored or AI scenario is
 * never overwritten by a generated one.
 */
import type { AtlasPlugin } from './types'
import { autoVariantScenarios, componentKey } from '../core'
import { defineAtlasPlugin } from './define'

export interface VariantMatrixOptions {
  /** base args merged into every generated scenario */
  baseArgs?: Record<string, unknown>
}

export function variantMatrixPlugin(options: VariantMatrixOptions = {}): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:variant-matrix',
    decorate(ci) {
      if (ci.axes.length === 0) return ci
      const existing = new Set(ci.scenarios.map((s) => s.id))
      // Keyed by IDENTITY, not name. Two packages exporting a `Button` with the
      // same `state` axis would otherwise both generate `button--state-primary`
      // — colliding in the catalog file, in the verify verdicts, and in the
      // snapshot filenames, each one a silent overwrite.
      const generated = autoVariantScenarios(componentKey(ci), ci.axes, options.baseArgs).filter(
        (s) => !existing.has(s.id),
      )
      if (generated.length === 0) return ci
      return { ...ci, scenarios: [...ci.scenarios, ...generated] }
    },
  })
}
