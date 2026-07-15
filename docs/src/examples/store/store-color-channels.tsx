import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * A multi-field store with per-field writes. Each channel is its own signal;
 * a button steps just that field via `store.r.set()` (the fast path — no bulk
 * `patch()`), and the swatch, reading all three fields in one reactive thunk,
 * recomputes its color in place.
 */
const useRgb = defineStore('docs-rgb-channels', () => {
  const r = signal(90)
  const g = signal(90)
  const b = signal(90)
  return { r, g, b }
})

export default function StoreColorChannels() {
  const { store } = useRgb()

  const step = (sig: { (): number; set: (v: number) => void }) =>
    sig.set(sig() >= 225 ? 45 : sig() + 45)

  const channel = (aria: string, onClick: () => void, bg: string) =>
    h('button', {
      onClick,
      'aria-label': aria,
      style: {
        width: '32px',
        height: '32px',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        background: bg,
      },
    })

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', alignItems: 'center', gap: '24px', padding: '22px' } },
    h('div', {
      class: 'swatch',
      style: () => ({
        width: '92px',
        height: '92px',
        borderRadius: '16px',
        background: `rgb(${store.r()}, ${store.g()}, ${store.b()})`,
        transition: 'background 0.2s',
      }),
    }),
    h(
      'div',
      { class: 'col', style: { gap: '10px' } },
      channel('step red', () => step(store.r), '#f87171'),
      channel('step green', () => step(store.g), '#4ade80'),
      channel('step blue', () => step(store.b), '#60a5fa'),
    ),
  )
}
