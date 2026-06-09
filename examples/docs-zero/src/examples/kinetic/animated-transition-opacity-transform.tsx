import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Animated transition — opacity + transform.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function AnimatedTransitionOpacityTransform() {
  // kinetic wraps a CSS transition over a signal-driven boolean.
  // Here the visible signal drives both opacity AND a Y translation
  // for a polished show/hide motion.
  const visible = signal(true)
  const toggle = () => visible.update(v => !v)

  return h('div', { class: 'col' },
    h('button', { onClick: toggle }, () => visible() ? '▼ Hide' : '▶ Show'),
    h('div', { class: 'card', style: {
      transition: 'opacity 260ms ease, transform 260ms ease',
      opacity: () => visible() ? 1 : 0,
      transform: () => visible() ? 'translateY(0)' : 'translateY(-8px)',
      pointerEvents: () => visible() ? 'auto' : 'none',
    } },
      h('div', { style: { fontWeight: '600' } }, 'Animated panel'),
      h('div', { class: 'muted', style: { marginTop: '4px' } },
        'opacity + transform driven by a signal — kinetic generalises this.',
      ),
    ),
  )
}
