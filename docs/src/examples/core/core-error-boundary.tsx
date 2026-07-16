import { ErrorBoundary, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * `<ErrorBoundary>` catches a throw from its subtree and renders `fallback`
 * instead of crashing. Here the green panel is healthy; pressing break mounts a
 * child that throws, so the red fallback appears — click it to `reset()` and
 * recover back to green.
 */
export default function CoreErrorBoundary() {
  const broken = signal(false)
  const OkPanel = () =>
    h('div', { class: 'ok', style: { width: '92px', height: '92px', borderRadius: '16px', background: '#4ade80' } })
  const BoomPanel = () => {
    throw new Error('boom')
  }

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '20px' } },
    h(
      ErrorBoundary,
      {
        fallback: (_err: unknown, reset: () => void) =>
          h('div', {
            class: 'err',
            'aria-label': 'reset',
            onClick: () => {
              broken.set(false)
              reset()
            },
            style: { width: '92px', height: '92px', borderRadius: '16px', background: '#f87171', cursor: 'pointer' },
          }),
      },
      () => (broken() ? h(BoomPanel, {}) : h(OkPanel, {})),
    ),
    h('button', {
      onClick: () => broken.set(true),
      'aria-label': 'break',
      style: { width: '46px', height: '28px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#cbd5e1' },
    }),
  )
}
