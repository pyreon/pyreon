/**
 * Baseline: real `<Button>` from `@pyreon/ui-components`, mounted N times.
 *
 * This is the CURRENT cost — every mount goes through:
 *   rocketstyle wrapper → attrs HOC → Element → Wrapper → styled('button')
 * = 5 mount layers per visible <button>.
 */

import { h, type VNodeChild } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { Button } from '@pyreon/ui-components'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'

/**
 * Mount a long-lived PyreonUI provider into `root` and return a `mountInto`
 * function that mounts a single `<Button>` into that provider's context.
 *
 * This amortizes PyreonUI's setup cost — the provider mounts once, the
 * timed loop only pays per-Button cost. Real apps pay PyreonUI once per
 * app boot, not per component mount.
 */
export function setupPyreonProvider(root: Element): {
  mountInto: (i: number) => () => void
  disposeProvider: () => void
} {
  const disposeProvider = mount(
    h(
      PyreonUI,
      { theme, mode: 'light' as const },
      h('div', { id: '__pyreon-ctx-host' }),
    ) as unknown as VNodeChild,
    root,
  )
  const inner = root.querySelector('#__pyreon-ctx-host')
  if (!inner) throw new Error('setupPyreonProvider: context host not found in DOM')
  return {
    mountInto: (i: number) =>
      mount(
        h(Button, { state: 'primary', size: 'large' }, `label-${i}`) as unknown as VNodeChild,
        inner,
      ),
    disposeProvider,
  }
}

/** Compatibility: full mount (provider + button) — used for the parity check. */
export function mountBaselineButton(root: Element, i: number): () => void {
  return mount(
    h(
      PyreonUI,
      { theme, mode: 'light' as const },
      h(Button, { state: 'primary', size: 'large' }, `label-${i}`),
    ) as unknown as VNodeChild,
    root,
  )
}
