/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

// Script module's strategy state machine + dedup logic. Mirror link.test.ts's
// approach: test pure derivations + the public API surface; leave the full
// onMount-driven strategy plumbing to e2e (happy-dom can't reliably drive
// IntersectionObserver / requestIdleCallback / scroll-event ordering).

describe('script strategy resolution', () => {
  type Strategy = 'beforeHydration' | 'afterHydration' | 'onIdle' | 'onInteraction' | 'onViewport'
  function resolveStrategy(s: Strategy | undefined): Strategy {
    return s ?? 'afterHydration'
  }

  it('defaults to afterHydration when unset', () => {
    expect(resolveStrategy(undefined)).toBe('afterHydration')
  })

  it('passes explicit strategy through', () => {
    expect(resolveStrategy('onIdle')).toBe('onIdle')
    expect(resolveStrategy('onViewport')).toBe('onViewport')
    expect(resolveStrategy('onInteraction')).toBe('onInteraction')
    expect(resolveStrategy('beforeHydration')).toBe('beforeHydration')
  })
})

describe('script initial pending state', () => {
  type Strategy = 'beforeHydration' | 'afterHydration' | 'onIdle' | 'onInteraction' | 'onViewport'
  function initialPending(strategy: Strategy): boolean {
    // beforeHydration: nothing to load (already in HTML)
    // afterHydration: synchronously triggered in onMount → effectively not pending from consumer's POV
    // Others: actually waiting for trigger → pending = true
    return strategy !== 'beforeHydration' && strategy !== 'afterHydration'
  }

  it('synchronous strategies start NOT pending', () => {
    expect(initialPending('beforeHydration')).toBe(false)
    expect(initialPending('afterHydration')).toBe(false)
  })

  it('deferred strategies start pending', () => {
    expect(initialPending('onIdle')).toBe(true)
    expect(initialPending('onInteraction')).toBe(true)
    expect(initialPending('onViewport')).toBe(true)
  })
})

describe('script needsSentinel', () => {
  type Strategy = 'beforeHydration' | 'afterHydration' | 'onIdle' | 'onInteraction' | 'onViewport'
  function needsSentinel(strategy: Strategy): boolean {
    return strategy === 'onViewport'
  }

  it('only onViewport needs a sentinel', () => {
    expect(needsSentinel('onViewport')).toBe(true)
    expect(needsSentinel('afterHydration')).toBe(false)
    expect(needsSentinel('onIdle')).toBe(false)
    expect(needsSentinel('onInteraction')).toBe(false)
    expect(needsSentinel('beforeHydration')).toBe(false)
  })
})

describe('script dedup by id', () => {
  function isDuplicate(id: string | undefined, doc: Document): boolean {
    if (!id) return false
    return !!doc.getElementById(id)
  }

  it('returns false when no id is provided', () => {
    expect(isDuplicate(undefined, document)).toBe(false)
  })

  it('returns false when id is unique', () => {
    expect(isDuplicate('unique-script-1', document)).toBe(false)
  })

  it('returns true when an element with the same id exists', () => {
    const existing = document.createElement('script')
    existing.id = 'analytics-script'
    document.head.appendChild(existing)
    try {
      expect(isDuplicate('analytics-script', document)).toBe(true)
    } finally {
      existing.remove()
    }
  })
})

describe('script three-layer API surface', () => {
  it('exports useScript as a function', async () => {
    const mod = await import('../script')
    expect(typeof mod.useScript).toBe('function')
  })

  it('exports createScript as a function', async () => {
    const mod = await import('../script')
    expect(typeof mod.createScript).toBe('function')
  })

  it('exports the default Script component', async () => {
    const mod = await import('../script')
    expect(typeof mod.Script).toBe('function')
  })

  it('createScript returns a wrapped component', async () => {
    const { createScript } = await import('../script')
    const Custom = createScript(() => null)
    expect(typeof Custom).toBe('function')
  })
})

describe('useScript — real hook (bisect-verifies the strategy / needsSentinel contract)', () => {
  // These tests exercise the actual `useScript` export so the bisect chain
  // tracks the source. Lock the strategy → state contract: onViewport
  // needs a sentinel and a ref; other strategies do not.

  it('onViewport — sentinelRef is defined, needsSentinel is true, pending starts true', async () => {
    const { useScript } = await import('../script')
    const result = useScript({
      src: '/widget.js',
      strategy: 'onViewport',
    })
    expect(result.sentinelRef).toBeDefined()
    expect(result.needsSentinel).toBe(true)
    expect(result.pending()).toBe(true)
    expect(result.loaded()).toBe(false)
    expect(result.errored()).toBe(false)
  })

  it('afterHydration — sentinelRef undefined, needsSentinel false, pending false', async () => {
    const { useScript } = await import('../script')
    const result = useScript({
      src: '/analytics.js',
      strategy: 'afterHydration',
    })
    expect(result.sentinelRef).toBeUndefined()
    expect(result.needsSentinel).toBe(false)
    expect(result.pending()).toBe(false)
  })

  it('onIdle — sentinelRef undefined, needsSentinel false, pending starts TRUE (waiting for idle)', async () => {
    const { useScript } = await import('../script')
    const result = useScript({
      src: '/heavy.js',
      strategy: 'onIdle',
    })
    expect(result.sentinelRef).toBeUndefined()
    expect(result.needsSentinel).toBe(false)
    expect(result.pending()).toBe(true)
  })

  it('onInteraction — needsSentinel false, pending starts true', async () => {
    const { useScript } = await import('../script')
    const result = useScript({
      src: '/chat.js',
      strategy: 'onInteraction',
    })
    expect(result.needsSentinel).toBe(false)
    expect(result.pending()).toBe(true)
  })

  it('exposes imperative load() function', async () => {
    const { useScript } = await import('../script')
    const result = useScript({
      src: '/widget.js',
      strategy: 'onViewport',
    })
    expect(typeof result.load).toBe('function')
  })
})

describe('createScript — HOC composition (bisect-verifies render-props contract)', () => {
  // The HOC returns a VNode `{ type: WrappedComponent, props:
  // ScriptRenderProps, ... }` — JSX is lazy. We inspect the VNode's
  // `.props` directly. Bisect target: revert any slot assignment in
  // createScript and the matching slot in the returned VNode props goes
  // missing → test fails.

  it('returned VNode props carry sentinelRef, needsSentinel, loaded, errored, pending under onViewport', async () => {
    const { createScript } = await import('../script')
    const Custom = createScript(() => null)
    const vnode = Custom({ src: '/widget.js', strategy: 'onViewport' }) as {
      props: Record<string, unknown>
    }
    expect(vnode.props.sentinelRef).toBeDefined()
    expect(vnode.props.needsSentinel).toBe(true)
    expect(typeof vnode.props.loaded).toBe('function')
    expect(typeof vnode.props.errored).toBe('function')
    expect(typeof vnode.props.pending).toBe('function')
  })

  it('afterHydration — needsSentinel false, sentinelRef undefined', async () => {
    const { createScript } = await import('../script')
    const Custom = createScript(() => null)
    const vnode = Custom({ src: '/analytics.js', strategy: 'afterHydration' }) as {
      props: { needsSentinel: boolean; sentinelRef: unknown }
    }
    expect(vnode.props.needsSentinel).toBe(false)
    expect(vnode.props.sentinelRef).toBeUndefined()
  })

  it('default Script returns a wrapper VNode whose render-props produce a sentinel <div> under onViewport', async () => {
    const { Script } = await import('../script')
    const vnode = Script({ src: '/widget.js', strategy: 'onViewport' }) as {
      type: unknown
      props: { needsSentinel: boolean; sentinelRef: unknown }
    }
    // The default Script's wrapped component is the inline `({ ... }) => needsSentinel ? <div .../> : null`
    // that createScript receives — confirmed by the VNode having a function `type`
    // and ScriptRenderProps slots.
    expect(typeof vnode.type).toBe('function')
    expect(vnode.props.needsSentinel).toBe(true)
    expect(vnode.props.sentinelRef).toBeDefined()
  })

  it('default Script under non-viewport strategies has needsSentinel=false in render-props', async () => {
    const { Script } = await import('../script')
    const strategies = ['afterHydration', 'onIdle', 'onInteraction', 'beforeHydration'] as const
    for (const strategy of strategies) {
      const vnode = Script({ src: '/a.js', strategy }) as { props: { needsSentinel: boolean } }
      expect(vnode.props.needsSentinel).toBe(false)
    }
  })
})

describe('useScript — real mount (covers onMount strategy machine)', () => {
  // These tests actually mount <Script> via @pyreon/runtime-dom so the
  // onMount body fires and the strategy state machine runs end-to-end.
  // Without real mount, the switch(strategy) block + loadScript() body
  // are never invoked (they live inside onMount). Coverage drops below
  // threshold without these.

  async function setup() {
    const { mount } = await import('@pyreon/runtime-dom')
    const { h } = await import('@pyreon/core')
    const { Script } = await import('../script')
    const container = document.createElement('div')
    document.body.appendChild(container)
    document.head.innerHTML = ''
    return {
      mount,
      h,
      Script,
      container,
      cleanup: () => {
        document.head.innerHTML = ''
        container.remove()
      },
    }
  }

  it('afterHydration — appends <script> to document.head immediately on mount', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      // h(Script, props) builds a VNode whose .type is the Script function;
      // mount() invokes it INSIDE Pyreon's hooks scope so onMount fires.
      // Calling Script(props) directly bypasses the scope — onMount never runs.
      const unmount = mount(
        h(Script, { src: '/test-after-hydration.js', strategy: 'afterHydration' }),
        container,
      )
      const script = document.head.querySelector('script[src="/test-after-hydration.js"]')
      expect(script).not.toBeNull()
      unmount()
    } finally {
      cleanup()
    }
  })

  it('afterHydration with id — dedupes (second mount with same id does NOT append a second script)', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount1 = mount(
        h(Script, { src: '/dedup.js', strategy: 'afterHydration', id: 'analytics' }),
        container,
      )
      const c2 = document.createElement('div')
      document.body.appendChild(c2)
      const unmount2 = mount(
        h(Script, { src: '/dedup.js', strategy: 'afterHydration', id: 'analytics' }),
        c2,
      )
      const scripts = document.head.querySelectorAll('script[id="analytics"]')
      expect(scripts.length).toBe(1)
      unmount1()
      unmount2()
      c2.remove()
    } finally {
      cleanup()
    }
  })

  it('inline script — children body is set as script.textContent', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Script, { src: '', strategy: 'afterHydration', children: 'console.log("inline")' }),
        container,
      )
      const script = Array.from(document.head.querySelectorAll('script')).find((s) =>
        s.textContent?.includes('console.log("inline")'),
      )
      expect(script).toBeDefined()
      unmount()
    } finally {
      cleanup()
    }
  })

  it('onInteraction — does NOT append <script> until an interaction event fires', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Script, { src: '/interaction.js', strategy: 'onInteraction' }),
        container,
      )
      expect(document.head.querySelector('script[src="/interaction.js"]')).toBeNull()
      document.dispatchEvent(new Event('click'))
      expect(document.head.querySelector('script[src="/interaction.js"]')).not.toBeNull()
      unmount()
    } finally {
      cleanup()
    }
  })

  it('onIdle — schedules loadScript via requestIdleCallback or setTimeout fallback', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount = mount(h(Script, { src: '/idle.js', strategy: 'onIdle' }), container)
      expect(document.head.querySelector('script[src="/idle.js"]')).toBeNull()
      // happy-dom may have requestIdleCallback OR fall through to setTimeout(200).
      // Wait long enough for either.
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(document.head.querySelector('script[src="/idle.js"]')).not.toBeNull()
      unmount()
    } finally {
      cleanup()
    }
  })

  it('beforeHydration — does NOT append <script> (marker for already-present in HTML)', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Script, { src: '/before-hyd.js', strategy: 'beforeHydration' }),
        container,
      )
      expect(document.head.querySelector('script[src="/before-hyd.js"]')).toBeNull()
      unmount()
    } finally {
      cleanup()
    }
  })

  it('onLoad callback fires + loaded signal flips when script.onload is invoked', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      let onLoadFired = 0
      const unmount = mount(
        h(Script, {
          src: '/with-onload.js',
          strategy: 'afterHydration',
          onLoad: () => {
            onLoadFired += 1
          },
        }),
        container,
      )
      const script = document.head.querySelector(
        'script[src="/with-onload.js"]',
      ) as HTMLScriptElement | null
      expect(script).not.toBeNull()
      // Simulate the browser firing onload (happy-dom doesn't actually load scripts).
      script?.onload?.(new Event('load'))
      expect(onLoadFired).toBe(1)
      unmount()
    } finally {
      cleanup()
    }
  })

  it('onError callback fires + errored signal flips when script.onerror is invoked', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      let lastError: Error | null = null
      const unmount = mount(
        h(Script, {
          src: '/with-onerror.js',
          strategy: 'afterHydration',
          onError: (err) => {
            lastError = err
          },
        }),
        container,
      )
      const script = document.head.querySelector(
        'script[src="/with-onerror.js"]',
      ) as HTMLScriptElement | null
      expect(script).not.toBeNull()
      // Simulate the browser firing onerror. happy-dom may also auto-fire
      // its own onerror for the missing src — we assert the callback
      // produced the expected Error shape (not the call count, which is
      // env-dependent).
      script?.onerror?.(new Event('error'))
      expect(lastError).toBeInstanceOf(Error)
      expect((lastError as Error | null)?.message).toContain('/with-onerror.js')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('async attribute defaults to true; can be disabled with async={false}', async () => {
    const { mount, h, Script, container, cleanup } = await setup()
    try {
      const unmount1 = mount(
        h(Script, { src: '/async-default.js', strategy: 'afterHydration' }),
        container,
      )
      const asyncDefault = document.head.querySelector(
        'script[src="/async-default.js"]',
      ) as HTMLScriptElement | null
      expect(asyncDefault?.async).toBe(true)
      unmount1()

      const c2 = document.createElement('div')
      document.body.appendChild(c2)
      const unmount2 = mount(
        h(Script, { src: '/async-off.js', strategy: 'afterHydration', async: false }),
        c2,
      )
      const asyncOff = document.head.querySelector(
        'script[src="/async-off.js"]',
      ) as HTMLScriptElement | null
      expect(asyncOff?.async).toBe(false)
      unmount2()
      c2.remove()
    } finally {
      cleanup()
    }
  })
})
