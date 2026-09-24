// <Flow> takes the app's colour mode (`<PyreonUI mode>` / `<ColorModeProvider>`
// from @pyreon/core) when it set one, stays light when it set none, and an
// explicit `colorMode` still wins. Following only an EXPLICIT app mode keeps
// the old default on a page that never asked (a dark OS under a light page).
import { ColorModeProvider, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountReactive } from '@pyreon/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { createFlow } from '../flow'

const graph = () => createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
const modeOf = (c: HTMLElement) => c.querySelector('.pyreon-flow')!.getAttribute('data-color-mode')

describe('<Flow> colour mode', () => {
  let cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups) c()
    cleanups = []
  })
  const mount = (vnode: ReturnType<typeof h>) => {
    const { container, cleanup } = mountReactive(vnode)
    cleanups.push(cleanup)
    return container
  }

  it('is light when the app set no mode', () => {
    expect(modeOf(mount(h(Flow, { instance: graph() })))).toBe('light')
  })

  it("follows the app's mode, live", () => {
    const m = signal<'light' | 'dark'>('dark')
    const c = mount(h(ColorModeProvider, { mode: () => m() }, h(Flow, { instance: graph() })))
    expect(modeOf(c)).toBe('dark')
    m.set('light')
    expect(modeOf(c)).toBe('light')
  })

  it('an explicit colorMode wins over the app', () => {
    const c = mount(h(ColorModeProvider, { mode: 'dark' }, h(Flow, { instance: graph(), colorMode: 'light' })))
    expect(modeOf(c)).toBe('light')
  })
})
