/**
 * A component's props may be an `interface`.
 *
 * `ComponentFn<P extends Props>` bounded `P` by `Record<string, unknown>`, and
 * an `interface` carries no implicit index signature, so it failed that bound:
 * `ComponentFn<ButtonProps>` and `defineComponent<ButtonProps>` were TS2344.
 * Core's own props interfaces carried `extends Props` purely to dodge the bound.
 * (`h()` is a separate, pre-existing looseness: when its typed overload rejects
 * the props it falls back to the untyped one, so it does not check props.)
 *
 * It reached published declarations too: `@pyreon/elements` types its props
 * as `Partial<{…}> & PyreonHTMLAttributes` (an interface). In source that sat
 * behind a generic and passed; the emitter wrote the instantiated form, so
 * every consumer compiling with `skipLibCheck: false` got TS2344 inside
 * `@pyreon/elements/lib/index.d.ts`.
 *
 * Types are erased, so the contract is asserted at compile time: reverting
 * the bound makes this file fail the package typecheck with TS2344.
 */
import { describe, expect, it } from 'vitest'
import { defineComponent } from '../component'
import { h } from '../h'
import type { PyreonHTMLAttributes } from '../jsx-runtime'
import type { ComponentFn } from '../types'

interface ButtonProps {
  label: string
  count?: number
}

const Button = (props: ButtonProps) => props.label

describe('interface props', () => {
  it('satisfy ComponentFn', () => {
    const fn: ComponentFn<ButtonProps> = Button
    const withAttrs: ComponentFn<Partial<{ tag: string }> & PyreonHTMLAttributes> = () => null
    expect(typeof fn).toBe('function')
    expect(typeof withAttrs).toBe('function')
  })

  it('are accepted by h()', () => {
    const vnode = h(Button, { label: 'Save', count: 1 })
    expect(vnode.props).toEqual({ label: 'Save', count: 1 })
  })

  it('work with defineComponent', () => {
    const Typed = defineComponent<ButtonProps>(Button)
    expect(Typed).toBe(Button)
  })
})
