import { onMount } from '@pyreon/core'
import { Document, Heading, Page, Table, Text, render } from '@pyreon/document'
import { type Signal, signal } from '@pyreon/reactivity'

/**
 * The live counterpart to the JSX-primitives snippet above — a REAL
 * `@pyreon/document` node tree, rendered through the SAME `render(node,
 * 'md')` call the docs use, not a hand-rolled string template. Edit the
 * fields; every keystroke rebuilds the document tree and re-renders it.
 *
 * `render()` is always async (every format — even the built-in text ones
 * — loads its renderer lazily, so a "md"-only app never pays for the PDF
 * engine). Rebuild-and-render is imperative work, so it lives in
 * `onMount`, subscribing to each source signal — not inside an `effect()`.
 */
export default function OneDocumentTreeManyFormatsMarkdownPreview() {
  const title = signal('Q4 Sales Report')
  const revenue = signal('$2.5M')
  const growth = signal(25)
  const regions = signal([
    { name: 'US', rev: '$1.2M', delta: '+30%' },
    { name: 'EU', rev: '$800K', delta: '+15%' },
    { name: 'APAC', rev: '$500K', delta: '+40%' },
  ])

  const markdown = signal('')
  onMount(() => {
    const rerender = () => {
      const node = (
        <Document title={title()}>
          <Page>
            <Heading level={1}>{title()}</Heading>
            <Text>{`Revenue grew ${growth()}% quarter over quarter.`}</Text>
            <Table
              columns={['Region', 'Revenue', 'Growth']}
              rows={regions().map((r) => [r.name, r.rev, r.delta])}
            />
            <Text bold>{`Total: ${revenue()}`}</Text>
          </Page>
        </Document>
      )
      void render(node, 'md').then((result) => markdown.set(String(result)))
    }
    rerender()
    const unsubs = [title, revenue, growth, regions].map((s) => s.subscribe(rerender))
    return () => { for (const u of unsubs) u() }
  })

  const textField = (label: string, sig: Signal<string>, flex: number) => (
    <label class="col" style={{ gap: '4px', flex, minWidth: '0' }}>
      <span class="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <input
        type="text"
        style="width: 100%;"
        value={() => sig()}
        onInput={(e: Event) => sig.set((e.target as HTMLInputElement).value)}
      />
    </label>
  )

  const numberField = (label: string, sig: Signal<number>, flex: number) => (
    <label class="col" style={{ gap: '4px', flex, minWidth: '0' }}>
      <span class="muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <input
        type="number"
        style="width: 100%;"
        value={() => String(sig())}
        onInput={(e: Event) => sig.set(Number((e.target as HTMLInputElement).value))}
      />
    </label>
  )

  return (
    <div class="col">
      <div class="row" style={{ alignItems: 'flex-end' }}>
        {textField('Title', title, 2)}
        {textField('Revenue', revenue, 1)}
        {numberField('Growth %', growth, 1)}
      </div>
      <div class="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          class="muted"
          style={{
            padding: '6px 10px',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '11px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          render(doc, 'md')
        </div>
        <pre
          style={{
            margin: 0,
            padding: '12px',
            whiteSpace: 'pre-wrap',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: '12px',
            lineHeight: '1.6',
            maxHeight: '220px',
            overflow: 'auto',
          }}
        >
          {() => markdown()}
        </pre>
      </div>
    </div>
  )
}
