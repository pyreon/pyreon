/**
 * Built-in: seed every scenario with the component's CONTENT.
 *
 * Two sources, merged UNDER each scenario's own args: the derived seed
 * (`ci.content` — a label for a `<button>`, a source for an `<img>`, blocks
 * for a layout container), and an authored `Default` scenario when the
 * project wrote one. The second is what makes a render-prop or data-driven
 * component's DERIVED scenarios render: `size=medium` on a PinInput is the
 * authored composition at medium size, not an empty base at medium size —
 * which is what it was when only the seed merged, and every variant of every
 * authored component verified as `empty-render`.
 *
 * Authored scenarios keep their own args over the seed (a hand-written value
 * always wins) and never inherit from `Default`: each one is a complete pinned
 * state by contract.
 */
import { seedArgs } from '../core'
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

export function contentPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:content',
    decorate(ci) {
      const authoredDefault = ci.scenarios.find((s) => s.source === 'authored' && s.name === 'Default')
      const derivedBase = { ...ci.content, ...authoredDefault?.args }
      const seed = ci.content ?? {}
      if (Object.keys(derivedBase).length === 0) return ci
      return {
        ...ci,
        scenarios: ci.scenarios.map((s) =>
          s.source === 'authored'
            ? { ...s, args: seedArgs(seed, s.args) }
            : { ...s, args: seedArgs(derivedBase, s.args) },
        ),
      }
    },
  })
}
