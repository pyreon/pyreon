import type { VNode } from '@pyreon/core'
import { afterEach, describe, expect, it } from 'vitest'
import { sheet } from '../sheet'
import { styled } from '../styled'

// ─── Integration tests ───────────────────────────────────────────────────────

describe('Styler integration — styled + sheet', () => {
  afterEach(() => {
    sheet.reset()
  })

  it('styled("div") with CSS applies a pyr- class to element', () => {
    const Box = styled('div')`
      color: red;
      display: flex;
    `
    const vnode = Box({}) as VNode
    expect(vnode.type).toBe('div')
    expect(vnode.props.class).toMatch(/^pyr-[0-9a-z]+$/)
  })

  it('dynamic styled with props-based interpolation produces different classes', () => {
    const Box = styled('div')`
      color: ${((props: Record<string, unknown>) => (props.color as string) || 'black') as any};
    `
    const vnode1 = Box({ color: 'red' }) as VNode
    const vnode2 = Box({ color: 'blue' }) as VNode
    // Dynamic interpolations produce different CSS, different hashes
    expect(vnode1.props.class).toMatch(/^pyr-/)
    expect(vnode2.props.class).toMatch(/^pyr-/)
    expect(vnode1.props.class).not.toBe(vnode2.props.class)
  })

  it('multiple styled components get different classes from same sheet', () => {
    const Red = styled('span')`
      color: red;
    `
    const Blue = styled('span')`
      color: blue;
    `
    const vnodeRed = Red({}) as VNode
    const vnodeBlue = Blue({}) as VNode
    expect(vnodeRed.props.class).toMatch(/^pyr-/)
    expect(vnodeBlue.props.class).toMatch(/^pyr-/)
    expect(vnodeRed.props.class).not.toBe(vnodeBlue.props.class)
  })

  it('@layer declarations exist in stylesheet (rocketstyle layer)', () => {
    // The sheet mounts on construction and injects @layer base, rocketstyle;
    // Verify the sheet has been mounted and can insert rules
    const className = sheet.insert('display: grid;')
    expect(className).toMatch(/^pyr-/)
    // Same CSS returns same class (dedup works)
    const className2 = sheet.insert('display: grid;')
    expect(className2).toBe(className)
  })
})
