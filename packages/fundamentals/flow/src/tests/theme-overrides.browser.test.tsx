import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Flow } from '../components/flow-component'
import { Controls } from '../components/controls'
import { createFlow } from '../flow'
import { flowStyles } from '../styles'
import type { NodeComponentProps } from '../types'

// #4427: the dark palette was declared as the PUBLIC `--pyreon-flow-*`
// variables on `.pyreon-flow` itself, and a value declared on an element
// always beats one inherited from an ancestor. So an override set on a wrapper
// (the documented way to theme) worked in light mode and was silently ignored
// in dark mode. Computed styles in real Chromium, because what wins the
// cascade and what inherits is the whole question.

const BRAND = 'rgb(255, 94, 26)'
const DARK_NODE_BG = 'rgb(31, 41, 55)' // #1f2937
const DARK_SELECTED = 'rgb(96, 165, 250)' // #60a5fa
const DARK_CONTROL = 'rgb(229, 231, 235)' // #e5e7eb
const LIGHT_NODE_BG = 'rgb(255, 255, 255)'

const graph = () =>
  createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [],
  })

let sheet: HTMLStyleElement

beforeEach(() => {
  sheet = document.createElement('style')
  sheet.textContent = flowStyles
  document.head.appendChild(sheet)
})

afterEach(() => {
  sheet.remove()
  document.body.innerHTML = ''
})

/** Mount `<Flow>` inside a wrapper carrying `wrapperStyle`; return the default node's box. */
async function mountFlow(colorMode: 'light' | 'dark', wrapperStyle = '', flowProps: Record<string, unknown> = {}) {
  const flow = graph()
  const mounted = mountInBrowser(
    h('div', { style: `width: 400px; height: 300px; ${wrapperStyle}` }, h(Flow, { instance: flow, colorMode, ...flowProps }, h(Controls, {}))),
  )
  await flush()
  const nodeBox = query(mounted.container, '.pyreon-flow-node > div')

  return { flow, mounted, nodeBox }
}

describe('--pyreon-flow-* overrides on an ancestor (#4427)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`win in ${mode} mode`, async () => {
      const { flow, mounted, nodeBox } = await mountFlow(mode, `--pyreon-flow-node-bg: ${BRAND}; --pyreon-flow-node-selected: ${BRAND};`)
      expect(getComputedStyle(nodeBox).backgroundColor).toBe(BRAND)
      flow.selectNode('1')
      await flush()
      expect(getComputedStyle(nodeBox).borderTopColor).toBe(BRAND)
      mounted.unmount()
    })
  }

  it('leave the dark defaults in place when nothing is overridden', async () => {
    const { flow, mounted, nodeBox } = await mountFlow('dark')
    expect(getComputedStyle(nodeBox).backgroundColor).toBe(DARK_NODE_BG)
    flow.selectNode('1')
    await flush()
    expect(getComputedStyle(nodeBox).borderTopColor).toBe(DARK_SELECTED)
    const button = query(mounted.container, '.pyreon-flow-controls button')
    expect(getComputedStyle(button).color).toBe(DARK_CONTROL)
    mounted.unmount()
  })

  it('light mode without overrides still uses the light fallbacks', async () => {
    const { mounted, nodeBox } = await mountFlow('light')
    expect(getComputedStyle(nodeBox).backgroundColor).toBe(LIGHT_NODE_BG)
    mounted.unmount()
  })

  it('an override on the Flow element itself (style) still wins in dark mode', async () => {
    const { mounted, nodeBox } = await mountFlow('dark', '', { style: `--pyreon-flow-node-bg: ${BRAND};` })
    expect(getComputedStyle(nodeBox).backgroundColor).toBe(BRAND)
    mounted.unmount()
  })

  it('an override on a panel inside the canvas still wins in dark mode', async () => {
    const own = document.createElement('style')
    own.textContent = `.pyreon-flow-controls { --pyreon-flow-control-color: ${BRAND}; }`
    document.head.appendChild(own)
    const { mounted } = await mountFlow('dark')
    const button = query(mounted.container, '.pyreon-flow-controls button')
    expect(getComputedStyle(button).color).toBe(BRAND)
    own.remove()
    mounted.unmount()
  })

  it('a custom node reading the public variable gets the resolved value', async () => {
    // Custom renderers theme themselves with the same variables
    // (`var(--pyreon-flow-node-bg)`), so inside the canvas each public
    // variable must still hold the value in force: the dark default, or the
    // ancestor's override.
    function Custom(_props: NodeComponentProps) {
      return h('div', { class: 'custom', style: 'background: var(--pyreon-flow-node-bg, rgb(1, 2, 3));' }, 'c')
    }
    const read = async (wrapperStyle: string) => {
      const flow = createFlow({ nodes: [{ id: '1', type: 'c', position: { x: 0, y: 0 }, data: {} }], edges: [] })
      const mounted = mountInBrowser(
        h('div', { style: `width: 400px; height: 300px; ${wrapperStyle}` }, h(Flow, { instance: flow, colorMode: 'dark', nodeTypes: { c: Custom } })),
      )
      await flush()
      const bg = getComputedStyle(query(mounted.container, '.custom')).backgroundColor
      mounted.unmount()

      return bg
    }
    expect(await read('')).toBe(DARK_NODE_BG)
    expect(await read(`--pyreon-flow-node-bg: ${BRAND};`)).toBe(BRAND)
  })
})
