import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — signal() in @pyreon/reactivity returns a Signal object (callable
// with .set/.update methods), but useOverlay destructures it as a tuple
// [getter, setter]. We mock signal() to return a simple tuple.
// ---------------------------------------------------------------------------

vi.mock('@pyreon/reactivity', () => {
  const signal = <T>(initial: T) => {
    let value = initial
    const s = (() => value) as (() => T) & {
      set: (v: T) => void
      update: (fn: (c: T) => T) => void
      peek: () => T
      subscribe: (listener: () => void) => () => void
      direct: (updater: () => void) => () => void
      label: string | undefined
      debug: () => { name: string | undefined; value: T; subscriberCount: number }
    }
    s.set = (v: T) => {
      value = v
    }
    s.update = (fn: (c: T) => T) => {
      value = fn(value)
    }
    s.peek = () => value
    s.subscribe = () => () => {
      /* noop */
    }
    s.direct = () => () => {
      /* noop */
    }
    s.label = undefined
    s.debug = () => ({ name: undefined, value, subscriberCount: 0 })
    return s
  }

  return { signal }
})

// onMount / onUnmount are no-ops outside a renderer
vi.mock('@pyreon/core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    Portal: actual.Fragment, // Portal stub — just renders children like a Fragment
  }
})

// render + throttle from @pyreon/ui-core
vi.mock('@pyreon/ui-core', async () => {
  const { h: createElement } = await import('@pyreon/core')

  const render = (content: unknown, attachProps?: Record<string, unknown>) => {
    if (!content) return null
    const t = typeof content
    if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') {
      return content as VNodeChild
    }
    if (Array.isArray(content)) return content as VNodeChild
    if (typeof content === 'function') {
      return createElement(content as ComponentFn, (attachProps ?? {}) as any)
    }
    if (typeof content === 'object') {
      return content as VNodeChild
    }
    return content as VNodeChild
  }

  const throttle = <F extends (...args: any[]) => any>(fn: F, _delay: number) => {
    const wrapped = (...args: any[]) => fn(...args)
    wrapped.cancel = () => {
      /* no-op */
    }
    return wrapped as F & { cancel: () => void }
  }

  return { render, throttle }
})

// @pyreon/unistyle — value() used in assignContentPosition
vi.mock('@pyreon/unistyle', () => ({
  value: (v: unknown) => (typeof v === 'number' ? `${v}px` : v),
}))

import { Fragment, h } from '@pyreon/core'
import { Overlay, useOverlay } from '../Overlay'

const asVNode = (v: unknown) => v as VNode

// ---------------------------------------------------------------------------
// useOverlay
// ---------------------------------------------------------------------------
describe('useOverlay', () => {
  describe('active state', () => {
    it('starts inactive by default', () => {
      const overlay = useOverlay()
      expect(overlay.active()).toBe(false)
    })

    it('starts active when isOpen is true', () => {
      const overlay = useOverlay({ isOpen: true })
      expect(overlay.active()).toBe(true)
    })

    it('showContent sets active to true', () => {
      const overlay = useOverlay()
      overlay.showContent()
      expect(overlay.active()).toBe(true)
    })

    it('hideContent sets active to false', () => {
      const overlay = useOverlay({ isOpen: true })
      overlay.hideContent()
      expect(overlay.active()).toBe(false)
    })

    it('showContent is idempotent', () => {
      const overlay = useOverlay()
      overlay.showContent()
      overlay.showContent()
      expect(overlay.active()).toBe(true)
    })

    it('hideContent is idempotent', () => {
      const overlay = useOverlay()
      overlay.hideContent()
      overlay.hideContent()
      expect(overlay.active()).toBe(false)
    })

    it('toggle between show/hide works', () => {
      const overlay = useOverlay()
      overlay.showContent()
      expect(overlay.active()).toBe(true)
      overlay.hideContent()
      expect(overlay.active()).toBe(false)
      overlay.showContent()
      expect(overlay.active()).toBe(true)
    })
  })

  describe('callbacks', () => {
    it('calls onOpen when showing content', () => {
      let opened = false
      const overlay = useOverlay({
        onOpen: () => {
          opened = true
        },
      })
      overlay.showContent()
      expect(opened).toBe(true)
    })

    it('calls onClose when hiding content', () => {
      let closed = false
      const overlay = useOverlay({
        isOpen: true,
        onClose: () => {
          closed = true
        },
      })
      overlay.hideContent()
      expect(closed).toBe(true)
    })
  })

  describe('alignment signals', () => {
    it('exposes alignX signal with default', () => {
      const overlay = useOverlay({ alignX: 'center' })
      expect(overlay.alignX()).toBe('center')
    })

    it('exposes alignY signal with default', () => {
      const overlay = useOverlay({ alignY: 'top' })
      expect(overlay.alignY()).toBe('top')
    })

    it('defaults alignX to left', () => {
      const overlay = useOverlay()
      expect(overlay.alignX()).toBe('left')
    })

    it('defaults alignY to bottom', () => {
      const overlay = useOverlay()
      expect(overlay.alignY()).toBe('bottom')
    })
  })

  describe('ref callbacks', () => {
    it('provides triggerRef callback', () => {
      const overlay = useOverlay()
      expect(typeof overlay.triggerRef).toBe('function')
    })

    it('provides contentRef callback', () => {
      const overlay = useOverlay()
      expect(typeof overlay.contentRef).toBe('function')
    })
  })

  describe('blocked state', () => {
    it('starts unblocked', () => {
      const overlay = useOverlay()
      expect(overlay.blocked()).toBe(false)
    })

    it('setBlocked increments blocked count', () => {
      const overlay = useOverlay()
      overlay.setBlocked()
      expect(overlay.blocked()).toBe(true)
    })

    it('setUnblocked decrements blocked count', () => {
      const overlay = useOverlay()
      overlay.setBlocked()
      overlay.setUnblocked()
      expect(overlay.blocked()).toBe(false)
    })

    it('multiple setBlocked calls require equal setUnblocked calls', () => {
      const overlay = useOverlay()
      overlay.setBlocked()
      overlay.setBlocked()
      overlay.setUnblocked()
      expect(overlay.blocked()).toBe(true)
      overlay.setUnblocked()
      expect(overlay.blocked()).toBe(false)
    })

    it('setUnblocked does not go below zero', () => {
      const overlay = useOverlay()
      overlay.setUnblocked()
      overlay.setUnblocked()
      expect(overlay.blocked()).toBe(false)
    })
  })

  describe('setupListeners', () => {
    it('returns a cleanup function', () => {
      const overlay = useOverlay()
      const cleanup = overlay.setupListeners()
      expect(typeof cleanup).toBe('function')
      cleanup()
    })
  })

  describe('disabled state', () => {
    it('forces active to false when disabled', () => {
      const overlay = useOverlay({ isOpen: true, disabled: true })
      expect(overlay.active()).toBe(false)
    })
  })

  describe('each hook instance has independent state', () => {
    it('two useOverlay instances do not share state', () => {
      const overlay1 = useOverlay()
      const overlay2 = useOverlay()

      overlay1.showContent()
      expect(overlay1.active()).toBe(true)
      expect(overlay2.active()).toBe(false)

      overlay2.showContent()
      expect(overlay1.active()).toBe(true)
      expect(overlay2.active()).toBe(true)

      overlay1.hideContent()
      expect(overlay1.active()).toBe(false)
      expect(overlay2.active()).toBe(true)
    })
  })

  describe('Provider', () => {
    it('exposes Provider component', () => {
      const overlay = useOverlay()
      expect(typeof overlay.Provider).toBe('function')
    })
  })

  describe('static align property', () => {
    it('returns align value passed in props', () => {
      const overlay = useOverlay({ align: 'top' })
      expect(overlay.align).toBe('top')
    })

    it('defaults align to bottom', () => {
      const overlay = useOverlay()
      expect(overlay.align).toBe('bottom')
    })
  })
})

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------
describe('Overlay component', () => {
  describe('VNode structure', () => {
    it('returns a Fragment', () => {
      const result = asVNode(
        Overlay({
          trigger: h('button', null, 'Click'),
          children: h('div', null, 'Panel'),
        }),
      )
      expect(result.type).toBe(Fragment)
    })

    it('has trigger as first child and reactive function as second child', () => {
      const result = asVNode(
        Overlay({
          trigger: h('button', null, 'Click'),
          children: h('div', null, 'Panel'),
        }),
      )
      expect(result.children.length).toBe(2)
      expect(typeof result.children[1]).toBe('function')
    })

    it('content function returns null when closed', () => {
      const result = asVNode(
        Overlay({
          trigger: h('button', null, 'Click'),
          children: h('div', null, 'Panel'),
        }),
      )
      const contentFn = result.children[1] as () => VNodeChild
      expect(contentFn()).toBeNull()
    })

    it('content function returns Portal VNode when opened via isOpen', () => {
      const result = asVNode(
        Overlay({
          trigger: h('button', null, 'Click'),
          children: h('div', null, 'Panel'),
          isOpen: true,
        }),
      )
      const contentFn = result.children[1] as () => VNodeChild
      // Portal is mocked as Fragment, so we just check it returns something
      expect(contentFn()).not.toBeNull()
    })
  })

  describe('trigger rendered via ComponentFn receives overlay props', () => {
    it('passes active and aria props to trigger component', () => {
      const TriggerComp: ComponentFn = (props: any) =>
        h('button', null, props.active ? 'Open' : 'Closed')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(triggerVNode.type).toBe(TriggerComp)
      expect(triggerVNode.props.active).toBe(false)
      expect(triggerVNode.props['aria-expanded']).toBe(false)
      expect(triggerVNode.props['aria-haspopup']).toBe('menu')
    })

    it('passes active=true when isOpen is true', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          isOpen: true,
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(triggerVNode.props.active).toBe(true)
      expect(triggerVNode.props['aria-expanded']).toBe(true)
    })

    it('passes aria-haspopup=dialog for modal type', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          type: 'modal',
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(triggerVNode.props['aria-haspopup']).toBe('dialog')
    })

    it('passes aria-haspopup=true for tooltip type', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          type: 'tooltip',
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(triggerVNode.props['aria-haspopup']).toBe('true')
    })

    it('passes ref via triggerRefName prop', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          triggerRefName: 'innerRef',
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(typeof triggerVNode.props.innerRef).toBe('function')
      // default 'ref' should not be set
      expect(triggerVNode.props.ref).toBeUndefined()
    })

    it('passes showContent/hideContent for manual openOn', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          openOn: 'manual',
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(typeof triggerVNode.props.showContent).toBe('function')
      expect(typeof triggerVNode.props.hideContent).toBe('function')
    })

    it('does not pass showContent/hideContent for click openOn', () => {
      const TriggerComp: ComponentFn = (_props: any) => h('button', null, 'T')

      const result = asVNode(
        Overlay({
          trigger: TriggerComp,
          children: h('div', null, 'Panel'),
          openOn: 'click',
          closeOn: 'click',
        }),
      )
      const triggerVNode = asVNode(result.children[0])
      expect(triggerVNode.props.showContent).toBeUndefined()
      expect(triggerVNode.props.hideContent).toBeUndefined()
    })
  })

  describe('trigger as VNode is passed through', () => {
    it('returns trigger VNode as-is when not a function', () => {
      const trigger = h('button', { id: 'btn' }, 'Click')
      const result = asVNode(
        Overlay({
          trigger,
          children: h('div', null, 'Panel'),
        }),
      )
      // render() passes VNode objects through directly
      const triggerChild = asVNode(result.children[0])
      expect(triggerChild.type).toBe('button')
      expect(triggerChild.props.id).toBe('btn')
    })
  })

  describe('displayName and metadata', () => {
    it('has displayName set', () => {
      expect(Overlay.displayName).toBeDefined()
      expect(Overlay.displayName).toContain('Overlay')
    })

    it('has PYREON__COMPONENT set', () => {
      expect(Overlay.PYREON__COMPONENT).toBeDefined()
      expect(Overlay.PYREON__COMPONENT).toContain('Overlay')
    })
  })
})
