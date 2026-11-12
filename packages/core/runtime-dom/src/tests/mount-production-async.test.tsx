/**
 * Async components and devtools registration with NODE_ENV='production'.
 *
 * Production mounts skip devtools entirely: no component ids, no scope
 * registry, no dev console output. What must NOT change is the component
 * itself: it renders when its promise settles, a rejection is routed to the
 * error boundary or swallowed (silently, in production), and unmounting stops
 * it. Also: the module-load allocation of the dev-only structures is skipped
 * when the module is evaluated in production.
 */
import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import { EffectScope } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'
import { _devUnregisterScope } from '../mount'

let orig: string | undefined
beforeEach(() => {
  orig = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
})
afterEach(() => {
  if (orig === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = orig
  vi.restoreAllMocks()
})

const host = (): HTMLElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('async components in production', () => {
  it('renders once the promise settles and unmounts cleanly', async () => {
    const Async = (async () => h('p', null, 'loaded')) as unknown as ComponentFn
    const root = host()
    const unmount = mount(h(Async, null), root)
    await settle()
    expect(root.textContent).toBe('loaded')
    unmount()
    expect(root.textContent).toBe('')
    root.remove()
  })

  it('swallows a rejection silently when no boundary handles it (no dev console output)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Boom = (async () => {
      throw new Error('nope')
    }) as unknown as ComponentFn
    const root = host()
    const unmount = mount(h(Boom, null), root)
    await settle()
    expect(error).not.toHaveBeenCalled()
    expect(root.textContent).toBe('')
    unmount()
    root.remove()
  })

  it('does not render a result that arrives after unmount', async () => {
    let release!: (v: ReturnType<typeof h>) => void
    const Late: ComponentFn = () =>
      new Promise<ReturnType<typeof h>>((r) => {
        release = r
      }) as never
    const root = host()
    const unmount = mount(h(Late, null), root)
    unmount()
    release(h('p', null, 'late'))
    await settle()
    expect(root.textContent).toBe('')
    root.remove()
  })
})

describe('_devUnregisterScope', () => {
  it('is a no-op for a scope that was never registered', () => {
    process.env.NODE_ENV = orig ?? 'test'
    const scope = new EffectScope()
    expect(() => _devUnregisterScope(scope)).not.toThrow()
  })
})

describe('module evaluation in production', () => {
  it('mounts and renders when mount.ts is loaded with NODE_ENV=production', async () => {
    vi.resetModules()
    const fresh = await import('../mount')
    const root = host()
    const unmount = fresh.mountChild(h('p', null, 'prod'), root, null)
    expect(root.textContent).toBe('prod')
    unmount()
    root.remove()
  })
})
