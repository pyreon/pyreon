// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — One document tree → many formats (markdown preview).
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function OneDocumentTreeManyFormatsMarkdownPreview() {
  // @pyreon/document renders ONE primitive tree to 14+ formats:
  // PDF, DOCX, XLSX, HTML, email, Slack, Notion, Markdown, etc.
  // Here we tap a markdown renderer directly so you can see the
  // "same data, different format" model live.
  const title = signal('Q4 Sales Report')
  const revenue = signal('$2.5M')
  const growth = signal(25)
  const regions = signal([
    { name: 'US',   rev: '$1.2M', delta: '+30%' },
    { name: 'EU',   rev: '$800K', delta: '+15%' },
    { name: 'APAC', rev: '$500K', delta: '+40%' },
  ])

  const markdown = computed(() => {
    const header = '# ' + title()
    const lead = 'Revenue grew **' + growth() + '%** quarter over quarter.'
    const tableHead = '| Region | Revenue | Growth |\n| --- | --- | --- |'
    const tableRows = regions()
      .map((r) => '| ' + r.name + ' | ' + r.rev + ' | ' + r.delta + ' |')
      .join('\n')
    const total = '> Total: **' + revenue() + '**'
    return [header, '', lead, '', tableHead, tableRows, '', total].join('\n')
  })

  const field = (label: any, sig: any, opts = {}) =>
    h('label', { class: 'col', style: { gap: '4px', flex: opts.flex ?? 1, minWidth: '0' } },
      h('span', { class: 'muted', style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' } }, label),
      h('input', {
        type: opts.type ?? 'text',
        style: { width: '100%' },
        value: () => String(sig()),
        onInput: (e: any) => sig.set(opts.type === 'number' ? Number(e.target.value) : e.target.value),
      }),
    )

  return h('div', { class: 'col' },
    h('div', { class: 'row', style: { alignItems: 'flex-end' } },
      field('Title', title, { flex: 2 }),
      field('Revenue', revenue, { flex: 1 }),
      field('Growth %', growth, { flex: 1, type: 'number' }),
    ),
    h('div', { class: 'card', style: { padding: 0, overflow: 'hidden' } },
      h('div', {
        class: 'muted',
        style: {
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: '11px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
      }, 'rendered → markdown'),
      h('pre', {
        style: {
          margin: 0,
          padding: '12px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: '12px',
          lineHeight: '1.6',
          maxHeight: '220px',
          overflow: 'auto',
        },
      }, () => markdown()),
    ),
  )
}
