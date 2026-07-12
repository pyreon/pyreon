/**
 * FW-1 regression: a getter-shaped `ref` / `innerRef` on a REACTIVE styled
 * component must not crash `DynamicStyled`.
 *
 * The compiler `_rp`-wraps any props-derived JSX prop, `makeReactiveProps`
 * turns it into a getter-ONLY descriptor, and styler's `buildProps`
 * descriptor-copies it — so `finalProps.ref = wrapper` (plain assignment, the
 * pre-fix code) threw `Cannot set property ref … which has only a getter`,
 * taking down the whole styled subtree. The crash fires ONLY on the reactive
 * path (`if (cssClass)` — a function interpolation / reactive axis), which is
 * exactly what every rocketstyle / elements component uses.
 *
 * The throw is a pure strict-mode "assign to getter-only accessor" TypeError,
 * identical in happy-dom and a real browser, so a happy-dom mount is faithful.
 */
import { effectScope, setCurrentScope } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { styled } from '../styled'

afterEach(() => {
  document.body.innerHTML = ''
})

// A reactive styled component (the function interpolation makes the class
// reactive → the `cssClass` branch that contains the ref-wrap runs).
const Btn = styled('button')`
  color: ${(p: { $c?: string }) => p.$c || 'red'};
`

/** Build raw props whose `ref`/`innerRef` is a getter-ONLY property — exactly
 *  what `makeReactiveProps` produces for a compiler-emitted reactive prop. */
function getterRefProps(key: 'ref' | 'innerRef', refFn: (n: Element | null) => void) {
  const raw: Record<string, unknown> = {
    // reactive-axis accessors — what a rocketstyle wrapper always passes
    $rocketstyle: () => ({}),
    $rocketstate: () => ({}),
  }
  Object.defineProperty(raw, key, { get: () => refFn, enumerable: true, configurable: true })
  return raw
}

describe('FW-1 — getter-shaped ref/innerRef through a reactive styled component', () => {
  for (const key of ['innerRef', 'ref'] as const) {
    it(`does not throw on a getter-only \`${key}\` and the ref still fires`, () => {
      let received: Element | null | undefined
      const refFn = (node: Element | null) => {
        received = node
      }
      const scope = effectScope()
      const prev = setCurrentScope(scope)
      try {
        const container = document.createElement('div')
        document.body.appendChild(container)
        // vnode creation is where the pre-fix assignment threw:
        const vnode = Btn(getterRefProps(key, refFn))
        // mount to prove the ref wrapper actually delivers the element:
        expect(() => mount(vnode, container)).not.toThrow()
        expect(container.querySelector('button')).not.toBeNull()
        expect(received).toBe(container.querySelector('button'))
      } finally {
        setCurrentScope(prev)
        scope.dispose?.()
      }
    })
  }
})
