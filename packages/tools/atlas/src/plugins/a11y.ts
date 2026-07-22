/**
 * Built-in: a pure, DOM-free static a11y check. If a component declares a
 * required name-providing prop (aria-label / alt / label / title / name), a
 * scenario that leaves it empty is flagged as a fail. The full axe-class runner
 * is a separate runtime plugin; this catches the most common
 * missing-accessible-name class with zero rendering, so even a headless catalog
 * carries a real verdict.
 */
import type { VerifyCheck } from '../core'
import type { AtlasPlugin, VerifyContext } from './types'
import { defineAtlasPlugin } from './define'

const NAME_PROP = /^(?:aria-label|aria-labelledby|alt|label|title|name)$/i

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

export function a11yPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:a11y-static',
    verify(ctx: VerifyContext): { a11y: VerifyCheck } {
      const nameProps = ctx.component.controls.filter((c) => c.required && NAME_PROP.test(c.name))
      if (nameProps.length === 0) return { a11y: { status: 'skip' } }
      const missing = nameProps
        .filter((c) => isEmpty(ctx.scenario.args[c.name]))
        .map((c) => `missing accessible name: "${c.name}" is empty`)
      return {
        a11y: missing.length > 0 ? { status: 'fail', findings: missing } : { status: 'pass' },
      }
    },
  })
}
