import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * useCounter — a numeric counter with min/max clamping.
 *
 * Self-contained reproduction of `@pyreon/hooks`'s `useCounter(0, { min, max })`:
 * `count` is a reactive signal and every step clamps into `[0, 5]`, so the `+`
 * button stops at 5 and the `-` button stops at 0. The real hook returns the
 * same `{ count, inc, dec, set, reset }` shape.
 */
export default function UseCounterClamped() {
  const min = 0
  const max = 5
  const count = signal(0)
  const clampSet = (v: number) => count.set(Math.max(min, Math.min(max, v)))
  const inc = () => clampSet(count() + 1)
  const dec = () => clampSet(count() - 1)
  const reset = () => count.set(0)

  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'row', style: { gap: '8px', alignItems: 'center' } },
      h('button', { onClick: dec }, '−'),
      h('strong', { style: { minWidth: '2ch', textAlign: 'center' } }, () => String(count())),
      h('button', { onClick: inc }, '+'),
      h('button', { onClick: reset }, 'reset'),
    ),
    h(
      'div',
      { class: 'muted', style: { marginTop: '6px' } },
      () =>
        count() === max
          ? 'At max (5) — inc is clamped.'
          : count() === min
            ? 'At min (0) — dec is clamped.'
            : 'Range is [0, 5].',
    ),
  )
}
