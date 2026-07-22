/**
 * Built-in: fills every scenario's UNSET required, non-reactive props with a
 * renderable placeholder, so auto-generated scenarios actually mount. Values
 * already set (including an explicit empty string) are left untouched — so the
 * a11y check still catches a scenario that deliberately blanks a name prop.
 */
import type { PropControl } from '../core'
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

/** A renderable placeholder for a control, or `undefined` when none applies. */
function placeholderFor(control: PropControl): unknown {
  switch (control.kind) {
    case 'text':
      return 'Text'
    case 'color':
      return '#3b82f6'
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'select':
      return control.options?.[0]
    default:
      return undefined // reactive / unknown — no meaningful placeholder
  }
}

export function fillDefaultsPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:fill-defaults',
    decorate(ci) {
      const required = ci.controls.filter((c) => c.required && !c.reactive)
      if (required.length === 0) return ci
      const scenarios = ci.scenarios.map((s) => {
        const filled: Record<string, unknown> = { ...s.args }
        let changed = false
        for (const control of required) {
          if (control.name in filled) continue
          const value = placeholderFor(control)
          if (value !== undefined) {
            filled[control.name] = value
            changed = true
          }
        }
        return changed ? { ...s, args: filled } : s
      })
      return { ...ci, scenarios }
    },
  })
}
