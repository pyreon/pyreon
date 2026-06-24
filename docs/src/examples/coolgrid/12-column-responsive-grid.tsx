import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — 12-column responsive grid.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function Ex12ColumnResponsiveGrid() {
  // Coolgrid distilled: a Row is a flex container of children whose
  // widths are expressed as a 0–12 share of the row. The real
  // Container / Row / Col add responsive breakpoints (xs/sm/md/lg/xl),
  // gutters, and offset support — same underlying model.
  const cols = signal([4, 4, 4])

  const presets = {
    thirds:   [4, 4, 4],
    halves:   [6, 6],
    sidebar:  [3, 9],
    header:   [12],
    quarters: [3, 3, 3, 3],
    asymmetric: [2, 7, 3],
  }

  const total = computed(() => cols().reduce((a, b) => a + b, 0))

  return h('div', { class: 'col' },
    h('div', { class: 'row' },
      h('span', { class: 'muted' }, 'preset:'),
      ...Object.keys(presets).map((name) =>
        h('button', {
          onClick: () => cols.set((presets as Record<string, any>)[name]),
          style: () => ({
            fontWeight: JSON.stringify(cols()) === JSON.stringify((presets as Record<string, any>)[name]) ? '700' : '400',
            background: JSON.stringify(cols()) === JSON.stringify((presets as Record<string, any>)[name]) ? 'var(--accent)' : null,
            color: JSON.stringify(cols()) === JSON.stringify((presets as Record<string, any>)[name]) ? 'var(--bg)' : null,
          }),
        }, name),
      ),
    ),
    h('div', {
      style: { display: 'flex', gap: '8px', padding: '8px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' },
    }, () =>
      cols().map((span) =>
        h('div', {
          style: {
            flex: span,
            padding: '20px 8px',
            background: 'var(--accent)',
            color: 'var(--bg)',
            borderRadius: '6px',
            textAlign: 'center',
            fontWeight: '600',
          },
        }, span + ' / 12'),
      ),
    ),
    h('div', { class: 'muted' }, () => 'sum: ' + total() + ' / 12'),
  )
}
