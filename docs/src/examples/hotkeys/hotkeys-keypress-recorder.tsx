import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Hotkeys — keypress recorder.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function HotkeysKeypressRecorder() {
  // useHotkey('mod+s', cb) handles scopes, modifier normalization,
  // and auto-cleanup on unmount. Here we do the raw event hookup so
  // the model is visible — focus the preview before pressing keys.
  const log = signal<string[]>([])
  const add = (label: any) => log.update(l => [label, ...l].slice(0, 6))

  const onKey = (e: any) => {
    const mods = []
    if (e.metaKey) mods.push('⌘')
    if (e.ctrlKey) mods.push('Ctrl')
    if (e.altKey) mods.push('Alt')
    if (e.shiftKey) mods.push('⇧')
    const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space'].includes(k)) {
      e.preventDefault()
    }
    add([...mods, k].join(' + '))
  }
  document.addEventListener('keydown', onKey)

  return h('div', { class: 'col' },
    h('div', { class: 'card', style: { textAlign: 'center' } },
      h('div', { class: 'muted' }, 'click here, then press any key'),
      h('div', { style: { fontSize: '20px', fontWeight: '700', marginTop: '4px' } },
        'try: ↑ ↓ Enter Space ⌘K',
      ),
    ),
    h('div', { class: 'card', style: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '13px' } },
      () => log().length === 0
        ? h('span', { class: 'muted' }, 'no keys pressed yet')
        : h('div', { class: 'col', style: { gap: '4px' } },
            ...log().map((entry) => h('div', null, '↳ ' + entry)),
          ),
    ),
  )
}
