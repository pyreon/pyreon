/**
 * Built-in: a pure, DOM-free static a11y check. If a component declares a
 * required name-providing prop (aria-label / alt / label / title / name), a
 * scenario that leaves it empty is flagged as a fail. The full axe-class runner
 * is a separate runtime plugin; this catches the most common
 * missing-accessible-name class with zero rendering, so even a headless catalog
 * carries a real verdict.
 */
import type { VerifyCheck } from '../core'
import { finding } from '../core'
import { skipped } from './registry'
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
      // A name-like prop is checked when the component REQUIRES it, or when
      // the scenario SUPPLIES it — a seeded `alt` on an `<img>`, an authored
      // `aria-label`. Required-only left every rocketstyle library skipped
      // wholesale (ui-components: 0 of 108 checked), because a chain declares
      // no required props; a supplied name that is empty is exactly the
      // finding this check exists for. EXCEPT the edge-cases plugin's own
      // Empty scenario blanking an OPTIONAL name: atlas manufactured that
      // state to exercise rendering, so reporting it would be atlas failing
      // its own question (a REQUIRED name empty there is still a finding —
      // the workshop's `button--empty` precedent).
      const manufactured = ctx.scenario.source === 'auto-edge'
      const nameProps = ctx.component.controls.filter(
        (c) => NAME_PROP.test(c.name) && (c.required || (!manufactured && c.name in ctx.scenario.args)),
      )
      if (nameProps.length === 0) {
        // NOT a gap in the component — this static check only knows how to
        // verify that a name-like prop was supplied, and this scenario carries
        // none. Saying so distinguishes it from "the check failed to run",
        // which is what a bare skip reads as.
        return {
          a11y: skipped(
            'nothing-to-check',
            'no name-like prop required or supplied to check statically — run `atlas verify-browser` for real axe-core coverage',
          ),
        }
      }
      const missing = nameProps
        .filter((c) => isEmpty(ctx.scenario.args[c.name]))
        .map((c) =>
          finding(
            'missing-accessible-name',
            `missing accessible name: "${c.name}" is empty`,
            `Give "${c.name}" a non-empty value, or an aria-label if the text is genuinely decorative.`,
          ),
        )
      return {
        a11y: missing.length > 0 ? { status: 'fail', findings: missing } : { status: 'pass' },
      }
    },
  })
}
