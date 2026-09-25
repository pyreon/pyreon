import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'

/**
 * Migrated from `<Playground>` — Live Breakpoint Detection.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 *
 * `@pyreon/unistyle` itself resolves breakpoints against the enriched theme
 * (see the "Responsive Values" section on this page); this demo distills the
 * same idea down to a bare `resize`-driven signal so the mechanics are
 * visible without a theme/provider setup. `useEventListener` (not a raw
 * `window.addEventListener`) removes the listener automatically on unmount —
 * required here since `<Example>` mounts and unmounts this component as the
 * reader scrolls the gallery.
 */
export default function LiveBreakpointDetection() {
  const breakpoints = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 }
  const width = signal(window.innerWidth)

  const resolve = (w: number) => {
    let name = 'xs'
    for (const [k, v] of Object.entries(breakpoints)) if (w >= v) name = k
    return name
  }

  useEventListener('resize', () => width.set(window.innerWidth))

  const current = () => resolve(width())

  return h('div', {},
    h('div', { style: { fontSize: '13px', color: '#666', marginBottom: '8px' } }, 'Resize the preview pane to see breakpoints change'),
    h('div', { style: { fontSize: '32px', fontWeight: 'bold', color: '#2196f3' } }, () => current()),
    h('div', { style: { fontSize: '13px' } }, () => width() + 'px wide'),
    h('div', { style: { marginTop: '12px', display: 'flex', gap: '4px' } },
      ...Object.entries(breakpoints).map(([name, _min]) =>
        h('span', {
          style: () => ({ padding: '4px 8px', borderRadius: '4px', fontSize: '12px', background: current() === name ? '#2196f3' : '#e0e0e0', color: current() === name ? 'white' : '#666' }),
        }, `${name} ≥${_min}`),
      ),
    ),
  )
}
