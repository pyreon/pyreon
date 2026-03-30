import type { VNode } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { styled } from '../styled'

describe('style injection (className generation)', () => {
  describe('dynamic styled components', () => {
    it('generates a proper className for dynamic CSS', () => {
      const Comp = styled('div')`
        color: ${(props: any) => props.$color};
      `

      const vnode = Comp({ $color: 'red' }) as VNode

      // Class should be present and properly generated
      expect(vnode.props.class).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it('works with multiple dynamic components', () => {
      const Comp1 = styled('div')`
        color: ${(p: any) => p.$c};
      `
      const Comp2 = styled('span')`
        font-size: ${(p: any) => p.$s};
      `

      const vnode1 = Comp1({ $c: 'red' }) as VNode
      const vnode2 = Comp2({ $s: '16px' }) as VNode

      expect(vnode1.props.class).toMatch(/^pyr-/)
      expect(vnode2.props.class).toMatch(/^pyr-/)
      expect(vnode1.props.class).not.toBe(vnode2.props.class)
    })

    it('handles different prop values producing different classNames', () => {
      const Comp = styled('div')`
        color: ${(p: any) => p.$color};
      `

      const colors = ['blue', 'green', 'yellow', 'purple', 'orange']
      const classNames = new Set<string>()

      for (const color of colors) {
        const vnode = Comp({ $color: color }) as VNode
        expect(vnode.props.class).toMatch(/^pyr-/)
        classNames.add(vnode.props.class as string)
      }

      // Different colors should produce different classNames
      expect(classNames.size).toBe(colors.length)
    })

    it('same dynamic CSS produces same className', () => {
      const Comp = styled('div')`
        color: ${(p: any) => p.$color};
      `

      const vnode1 = Comp({ $color: 'red' }) as VNode
      const cls1 = vnode1.props.class as string

      const _vnode2 = Comp({ $color: 'blue' }) as VNode

      const vnode3 = Comp({ $color: 'red' }) as VNode // back to red
      const cls3 = vnode3.props.class as string

      // Same resolved CSS -> same className
      expect(cls1).toBe(cls3)
    })
  })

  describe('static styled components', () => {
    it('static components compute class at creation time', () => {
      // Static components compute class at creation time
      const Comp = styled('div')`
        display: flex;
        color: red;
      `

      const vnode = Comp({}) as VNode

      expect(vnode.props.class).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it('static className is stable across calls', () => {
      const Comp = styled('div')`
        display: flex;
      `

      const vnode1 = Comp({}) as VNode
      const cls1 = vnode1.props.class as string

      const _vnode2 = Comp({}) as VNode
      const vnode3 = Comp({}) as VNode
      const cls3 = vnode3.props.class as string

      expect(cls1).toBe(cls3)
    })
  })

  describe('theme-dependent components', () => {
    it('produces different className for different resolved CSS', () => {
      // In Pyreon, theme is accessed via useTheme() inside the component.
      // Without ThemeProvider context, theme is {} (default).
      // We test via direct prop-based dynamic interpolation instead.
      const Comp = styled('div')`
        background: ${(p: any) => p.$bg};
      `

      const vnode1 = Comp({ $bg: 'white' }) as VNode
      const cls1 = vnode1.props.class as string

      const vnode2 = Comp({ $bg: 'black' }) as VNode
      const cls2 = vnode2.props.class as string

      expect(cls1).not.toBe(cls2)
      expect(cls1).toMatch(/^pyr-/)
      expect(cls2).toMatch(/^pyr-/)
    })
  })
})
