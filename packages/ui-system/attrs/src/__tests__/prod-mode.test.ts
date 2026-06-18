import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// These tests exercise the PRODUCTION side of the two `process.env.NODE_ENV
// !== 'production'` dev gates:
//   - attrs.ts EnhancedComponent: skips the `data-attrs` debug attribute.
//   - init.ts attrs(): skips the required-param validation throw.
// Modules are re-imported per test under a stubbed env so the gate evaluates
// the production branch at module-eval / call time.

describe('attrs — production-mode dev gates', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('does NOT attach data-attrs debug attribute in production', async () => {
    const { default: attrs } = await import('../init')
    const Receiver = (props: any) => ({ type: 'div', props, children: null, key: null })

    const Component = attrs({ name: 'ProdComp', component: Receiver as any })
    const vnode = Component({ label: 'x' }) as any

    expect(vnode.props['data-attrs']).toBeUndefined()
    expect(vnode.props.label).toBe('x')
  })

  it('does NOT throw on missing name in production (validation skipped)', async () => {
    const { default: attrs } = await import('../init')
    const Receiver = (props: any) => ({ type: 'div', props, children: null, key: null })

    // In dev a missing `name` throws; in production the validation block is
    // skipped entirely and a component is returned, with its name derived from
    // the component's own name/displayName. Exercises the prod side of the
    // dev-validation gate.
    expect(() =>
      attrs({ name: undefined as any, component: Receiver as any }),
    ).not.toThrow()
  })
})
