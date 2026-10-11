import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { Element } from '../Element'

const slots = ['label', 'content', 'children', 'beforeContent', 'afterContent'] as const

it.each(slots)('renders direct zero in the %s slot', (slot) => {
  const { container, unmount } = mountInBrowser(h(Element, { [slot]: 0 }))
  try {
    expect(container.textContent).toBe('0')
  } finally {
    unmount()
  }
})

it.each(slots.flatMap((slot) => [false, true].map((accessor) => ({ slot, accessor }))))(
  'keeps $slot visible through 1 → 0 → 2 (accessor: $accessor)',
  ({ slot, accessor }) => {
    const count = signal(1)
    const props = accessor
      ? { [slot]: () => count() }
      : {
          get [slot]() {
            return count()
          },
        }
    const { container, unmount } = mountInBrowser(h(Element, props))
    try {
      for (const value of [1, 0, 2]) {
        count.set(value)
        expect(container.textContent).toBe(String(value))
      }
    } finally {
      unmount()
    }
  },
)
