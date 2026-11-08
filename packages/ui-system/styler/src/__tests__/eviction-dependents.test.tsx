/**
 * Sheet eviction vs the caches ABOVE the sheet (client, happy-dom).
 *
 * The sheet bounds itself by evicting its oldest rules. Several layers hand a
 * class name out WITHOUT calling `sheet.insert()` — styled's rocketstyle
 * `classCache`, its `$element` `elClassCache`, the static component's
 * creation-time class, CPSE's shape cache — and `@keyframes` / static globals
 * are inserted once at module evaluation. Each of those used to keep handing
 * out a name whose rule had been evicted, so an element rendered unstyled.
 *
 * The contract these tests lock:
 *  - an upper cache revalidates its name against the sheet (`isLive`) and
 *    re-inserts an evicted rule on its next hit;
 *  - the sheet never evicts a class an element in the document still carries,
 *    nor a definition-owned key (keyframes, static global), nor a dynamic
 *    global while it is mounted.
 *
 * Fills the REAL singleton sheet past its real bound (10,000 rules).
 */
import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createGlobalStyle } from '../globalStyle'
import { keyframes } from '../keyframes'
import { sheet } from '../sheet'
import { styled } from '../styled'
import { ThemeProvider } from '../ThemeProvider'

const BOUND = 10_000
let fillSeq = 0
/** Insert enough unique rules to evict the oldest batch, then let the deferred client pass run. */
const overflowSheet = async (): Promise<void> => {
  for (let i = 0; i < BOUND + 10; i++) sheet.insert(`--evict-fill-${fillSeq++}: ${i};`)
  await Promise.resolve()
}

/** Text of every live CSS rule in the singleton's `<style>` tag. */
const liveCss = (): string => {
  const tag = query<HTMLStyleElement>(document, 'style[data-pyreon-styler]')
  return Array.from(tag.sheet!.cssRules, (r) => r.cssText).join('\n')
}

let cleanups: (() => void)[] = []
const render = (vnode: ReturnType<typeof h>): { el: HTMLElement; unmount: () => void } => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(vnode, root)
  let done = false
  const unmount = () => {
    if (done) return
    done = true
    dispose()
    root.remove()
  }
  cleanups.push(unmount)
  return { el: root.firstElementChild as HTMLElement, unmount }
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  sheet.clearAll()
})

type AnyComp = (props: Record<string, unknown>) => ReturnType<typeof h>

describe('sheet eviction — upper caches revalidate (no dangling class names)', () => {
  it('$element class cache: a remount after eviction gets a live rule', async () => {
    const Box = styled('div')`
      color: ${(p: { $element: { c: string } }) => p.$element.c};
    ` as unknown as AnyComp
    const bundle = { c: 'rgb(1, 2, 3)' }

    const first = render(h(Box as never, { $element: bundle }))
    const cls = first.el.className
    first.unmount()

    await overflowSheet()
    expect(sheet.has(cls)).toBe(false) // evicted: no element carried it

    const second = render(h(Box as never, { $element: bundle }))
    expect(second.el.className).toBe(cls)
    expect(sheet.has(cls)).toBe(true)
    expect(liveCss()).toContain(`.${cls}`)
  })

  it('rocketstyle class cache: a remount after eviction gets a live rule', async () => {
    const Btn = styled('button')`
      color: ${(p: { $rocketstyle: { c: string } }) => p.$rocketstyle.c};
    ` as unknown as AnyComp
    const rs = { c: 'rgb(4, 5, 6)' }
    const state = { pseudo: 'base' }

    const first = render(h(Btn as never, { $rocketstyle: rs, $rocketstate: state }))
    const cls = first.el.className
    first.unmount()

    await overflowSheet()
    expect(sheet.has(cls)).toBe(false)

    const second = render(h(Btn as never, { $rocketstyle: rs, $rocketstate: state }))
    expect(second.el.className).toBe(cls)
    expect(liveCss()).toContain(`.${cls}`)
  })

  it('static component: its creation-time class is re-inserted after eviction', async () => {
    const Static = styled('div')`
      color: rgb(7, 8, 9);
    ` as unknown as AnyComp

    const first = render(h(Static as never, {}))
    const cls = first.el.className
    first.unmount()

    await overflowSheet()
    expect(sheet.has(cls)).toBe(false)

    const second = render(h(Static as never, {}))
    expect(second.el.className).toBe(cls)
    expect(liveCss()).toContain(`.${cls}`)
  })
})

describe('sheet eviction — keys still in use are never evicted', () => {
  it('a class carried by a MOUNTED element survives eviction', async () => {
    const Box = styled('div')`
      color: ${(p: { $element: { c: string } }) => p.$element.c};
    ` as unknown as AnyComp
    const mounted = render(h(Box as never, { $element: { c: 'rgb(10, 11, 12)' } }))
    const cls = mounted.el.className

    await overflowSheet()

    expect(sheet.has(cls)).toBe(true)
    expect(liveCss()).toContain(`.${cls}`)
  })

  it('a module-level @keyframes survives eviction', async () => {
    const spin = keyframes`from{opacity:0}to{opacity:1}`
    await overflowSheet()
    expect(sheet.has(spin.name)).toBe(true)
    expect(liveCss()).toContain(spin.name)
  })

  it('a static global survives eviction', async () => {
    const StaticGlobal = createGlobalStyle`
      body { --static-global-marker: 1; }
    `
    expect(typeof StaticGlobal).toBe('function') // inserted at creation, no mount needed
    await overflowSheet()
    expect(liveCss()).toContain('--static-global-marker')
  })

  it('a dynamic global is held while mounted and evictable once unmounted', async () => {
    const Global = createGlobalStyle`
      body { --dyn-global-marker: ${(p: { theme?: { m?: number } }) => p.theme?.m ?? 0}; }
    ` as unknown as AnyComp
    const mounted = render(h(ThemeProvider as never, { theme: { m: 42 } }, h(Global as never, {})))

    await overflowSheet()
    expect(liveCss()).toContain('--dyn-global-marker: 42')

    mounted.unmount()
    await overflowSheet()
    expect(liveCss()).not.toContain('--dyn-global-marker: 42')
  })
})
