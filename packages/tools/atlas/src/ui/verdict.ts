/**
 * A component's verdict, folded from its scenarios' — the catalog dot.
 *
 * `fail` if any scenario failed a check; `ok` only when there are scenarios
 * and every one passed; otherwise `unverified`. A component with no scenarios
 * is unverified, never a pass: nothing examined it.
 */
import type { WorkbenchComponent } from './catalog'

export type ComponentVerdict = 'ok' | 'fail' | 'unverified'

export function componentVerdict(c: Pick<WorkbenchComponent, 'scenarios'>): ComponentVerdict {
  const scenarios = c.scenarios ?? []
  if (scenarios.length === 0) return 'unverified'
  if (scenarios.some((s) => s.verdict === 'fail')) return 'fail'
  return scenarios.every((s) => s.verdict === 'ok') ? 'ok' : 'unverified'
}
