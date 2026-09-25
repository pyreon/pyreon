import { h } from '@pyreon/core'
import { createHeadContext, HeadProvider, useHead } from '@pyreon/head'
import { signal } from '@pyreon/reactivity'

/**
 * A real `useHead()` call actually writes to the browser's live
 * `document.head` — there's no sandboxed preview mode. Edit the fields
 * below and your ACTUAL BROWSER TAB TITLE updates, because that's
 * exactly what the API does. `createHeadContext()` gives this demo its
 * own tag registry (instead of inheriting the docs site's), so it can't
 * fight the docs app's own tags for the same key.
 */
function Demo() {
  const title = signal('Live head demo — edit me!')
  const description = signal('Editing these fields calls useHead() for real.')

  useHead(() => ({
    title: title(),
    meta: [{ name: 'description', content: description() }],
  }))

  return h('div', { class: 'col' },
    h('label', { class: 'col', style: { gap: '4px' } },
      h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Page title'),
      h('input', {
        type: 'text',
        style: { width: '100%' },
        value: title,
        onInput: (e: Event) => title.set((e.target as HTMLInputElement).value),
      }),
    ),
    h('label', { class: 'col', style: { gap: '4px', marginTop: '8px' } },
      h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Meta description'),
      h('input', {
        type: 'text',
        style: { width: '100%' },
        value: description,
        onInput: (e: Event) => description.set((e.target as HTMLInputElement).value),
      }),
    ),
    h('div', {
      class: 'card',
      style: { marginTop: '8px', padding: '10px 12px' },
    },
      h('div', { style: { color: '#1a0dab', fontSize: '15px' } }, () => title()),
      h('div', { class: 'muted', style: { fontSize: '12px' } }, () => description()),
    ),
    h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' } },
      '↑ a real search-result preview built from the SAME title()/description() reads — plus check your actual browser tab.',
    ),
  )
}

export default function LiveTitleAndMetaPreview() {
  return h(HeadProvider, { context: createHeadContext() }, h(Demo, {}))
}
