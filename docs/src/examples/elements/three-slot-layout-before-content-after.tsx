import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Three-slot layout — [before] [content] [after].
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ThreeSlotLayoutBeforeContentAfter() {
  // Element renders a flex row with three slots: leading icon, growing
  // label, trailing badge. The slots auto-size: leading/trailing get
  // \`flex-shrink: 0\`, the label gets \`flex: 1\` so it wraps gracefully.
  const count = signal(3)

  return h('div', { class: 'col' },
    h('button', {
      onClick: () => count.update(n => n + 1),
      style: { display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: '180px' },
    },
      h('span', { style: { flexShrink: 0 } }, '📬'),
      h('span', { style: { flex: 1, textAlign: 'left' } }, 'Messages'),
      h('span', { class: 'badge', style: { flexShrink: 0 } }, () => count()),
    ),
    h('div', { class: 'muted' }, 'Click the button — only the badge re-renders.'),
  )
}
