// @vitest-environment node
/**
 * Sheet eviction vs the caches ABOVE the sheet, on the SERVER.
 *
 * A long-running server inserts rules for every distinct dynamic value it
 * renders; past the bound the sheet evicts its oldest. The styled class caches
 * kept handing out the evicted names, and `markUsed` found no rule text to push
 * — so later requests shipped class names with no CSS (app-shell components,
 * rendered first and therefore oldest, were hit first).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { keyframes } from '../keyframes'
import { sheet } from '../sheet'
import { styled } from '../styled'

const BOUND = 10_000
let fillSeq = 0
const overflowSheet = (): void => {
  for (let i = 0; i < BOUND + 10; i++)
    sheet.insert(`--ssr-evict-fill-${fillSeq++}: ${i};`, false, undefined, false)
}

afterEach(() => {
  sheet.reset()
})

type VNodeLike = { props: { class: string } }
type AnyComp = (props: Record<string, unknown>) => VNodeLike

describe('sheet eviction on the server — a later request still ships the rule', () => {
  it('$element class cache', () => {
    const Box = styled('div')`
      color: ${(p: { $element: { c: string } }) => p.$element.c};
    ` as unknown as AnyComp
    const bundle = { c: 'rgb(21, 22, 23)' }

    const cls = Box({ $element: bundle }).props.class
    overflowSheet()
    expect(sheet.has(cls)).toBe(false)

    sheet.resetSSRBuffer() // the next request
    expect(Box({ $element: bundle }).props.class).toBe(cls)
    expect(sheet.getStyleTag()).toContain(`.${cls}{`)
  })

  it('rocketstyle class cache', () => {
    const Btn = styled('button')`
      color: ${(p: { $rocketstyle: { c: string } }) => p.$rocketstyle.c};
    ` as unknown as AnyComp
    const rs = { c: 'rgb(24, 25, 26)' }
    const state = { pseudo: 'base' }

    const cls = Btn({ $rocketstyle: rs, $rocketstate: state }).props.class
    overflowSheet()

    sheet.resetSSRBuffer()
    expect(Btn({ $rocketstyle: rs, $rocketstate: state }).props.class).toBe(cls)
    expect(sheet.getStyleTag()).toContain(`.${cls}{`)
  })

  it('static component', () => {
    const Shell = styled('header')`
      color: rgb(27, 28, 29);
    ` as unknown as AnyComp
    // A prop takes the props path rather than the pre-built VNode; both
    // carry the same creation-time class.
    const cls = Shell({ id: 'a' }).props.class
    overflowSheet()

    sheet.resetSSRBuffer()
    expect(Shell({ id: 'a' }).props.class).toBe(cls)
    expect(sheet.getStyleTag()).toContain(`.${cls}{`)
  })

  it('module-level @keyframes is never evicted', () => {
    const fade = keyframes`from{opacity:0}to{opacity:1}`
    overflowSheet()
    sheet.resetSSRBuffer()
    expect(sheet.has(fade.name)).toBe(true)
  })
})

describe('dynamic global on the server', () => {
  it('renders without holding the key (a request copies the rules into its buffer)', async () => {
    const { createGlobalStyle } = await import('../globalStyle')
    const G = createGlobalStyle`
      body { --ssr-dyn: ${(p: { theme?: { v?: number } }) => p.theme?.v ?? 1}; }
    ` as unknown as (p: Record<string, unknown>) => null
    expect(G({})).toBeNull()
    const held = (sheet as unknown as { held: Map<string, number> }).held
    expect([...held.keys()].some((k) => k.startsWith('global-'))).toBe(false)
  })
})
