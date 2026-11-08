/**
 * cpseStyled's per-definition shape cache (`classByShape`) hands a class name
 * out without calling `sheet.insert()`. When the sheet evicts that rule, the
 * next render must re-insert it (`sheet.isLive`) — not keep handing out a name
 * with no CSS behind it. Fills the real singleton sheet past its bound.
 */
import { sheet } from '@pyreon/styler'
import { afterEach, describe, expect, it } from 'vitest'
import { cpseStyled } from '../cpse-styled'

interface CpseVNode {
  props: { class: string }
}

let seq = 0
const overflowSheet = async (): Promise<void> => {
  for (let i = 0; i < 10_010; i++) sheet.insert(`--cpse-evict-fill-${seq++}: ${i};`)
  await Promise.resolve()
}

afterEach(() => {
  sheet.clearAll()
})

describe('cpseStyled — shape cache vs sheet eviction', () => {
  it('flat shape: re-inserts an evicted rule on the next render', async () => {
    const Box = cpseStyled('div')
    const cls = (Box({ styles: { padding: 8 } }) as unknown as CpseVNode).props.class
    await overflowSheet()
    expect(sheet.has(cls)).toBe(false)
    expect((Box({ styles: { padding: 24 } }) as unknown as CpseVNode).props.class).toBe(cls)
    expect(sheet.has(cls)).toBe(true)
  })

  it('responsive shape: re-inserts an evicted rule on the next render', async () => {
    const Box = cpseStyled('div')
    const cls = (Box({ styles: { padding: [4, 8] } } as never) as unknown as CpseVNode).props.class
    await overflowSheet()
    expect(sheet.has(cls)).toBe(false)
    expect(
      (Box({ styles: { padding: [6, 12] } } as never) as unknown as CpseVNode).props.class,
    ).toBe(cls)
    expect(sheet.has(cls)).toBe(true)
  })
})
