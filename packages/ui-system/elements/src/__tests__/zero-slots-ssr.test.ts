// @vitest-environment node
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { Element } from '../Element'

const slots = ['label', 'content', 'children', 'beforeContent', 'afterContent'] as const

it.each(slots.flatMap((slot) => [false, true].map((accessor) => ({ slot, accessor }))))(
  'server-renders $slot through 1 → 0 → 2 (accessor: $accessor)',
  async ({ slot, accessor }) => {
    const count = signal(1)
    for (const value of [1, 0, 2]) {
      count.set(value)
      const html = await renderToString(h(Element, { [slot]: accessor ? () => count() : count() }))
      const text = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '')
      expect(text).toBe(String(value))
    }
  },
)
