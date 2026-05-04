import type { OutputFormat } from '@pyreon/document'
import { createDocument, Document, Heading, Page, render, Table, Text } from '@pyreon/document'
import { signal } from '@pyreon/reactivity'

const formats: { id: OutputFormat; label: string }[] = [
  { id: 'html', label: 'HTML' },
  { id: 'md', label: 'Markdown' },
  { id: 'text', label: 'Plain Text' },
  { id: 'csv', label: 'CSV' },
  { id: 'email', label: 'Email HTML' },
  { id: 'slack', label: 'Slack' },
]

export function DocumentDemo() {
  // ─── Builder pattern ─────────────────────────────────────────────────────
  const activeFormat = signal<OutputFormat>('html')
  const output = signal('Click "Render" to see output.')
  const rendering = signal(false)

  // Sample data
  const teamData = signal([
    ['Alice', 'Engineering', '$145K', '4.8'],
    ['Bob', 'Design', '$125K', '4.5'],
    ['Carol', 'Marketing', '$115K', '4.9'],
    ['Dave', 'Engineering', '$155K', '4.2'],
    ['Eve', 'Product', '$135K', '4.7'],
  ])

  // Build document using builder pattern
  function buildReport() {
    return createDocument({ title: 'Q4 Team Report' })
      .heading('Q4 Team Report')
      .text('Annual performance review summary for all departments.')
      .divider()
      .heading('Team Overview')
      .table({
        // `TableColumn` only carries `header` / `width` / `align` — column
        // identity comes from position, not a `key`. Rows are arrays of
        // `string | number`, indexed by the same column order.
        columns: [
          { header: 'Name' },
          { header: 'Department' },
          { header: 'Salary' },
          { header: 'Rating' },
        ],
        rows: teamData(),
      })
      .text(`Total team members: ${teamData().length}`)
      .divider()
      .heading('Notes')
      .list([
        'All ratings above 4.0 — strong quarter.',
        'Engineering headcount increased by 2.',
        'Marketing launched 3 new campaigns.',
      ])
      .quote('Great teams build great products.')
      .divider()
      .code('const avgRating = ratings.reduce((a, b) => a + b) / ratings.length')
      .text('Report generated automatically by @pyreon/document.')
  }

  // Render to selected format
  async function renderDocument() {
    rendering.set(true)
    try {
      const doc = buildReport()
      const docNode = doc.build()
      const rendered = await render(docNode, activeFormat())
      if (typeof rendered === 'string') {
        output.set(rendered)
      } else {
        output.set(`[Binary output: ${(rendered as Uint8Array).byteLength} bytes]`)
      }
    } catch (err) {
      output.set(`Error: ${(err as Error).message}`)
    } finally {
      rendering.set(false)
    }
  }

  // ─── JSX pattern demo ─────────────────────────────────────────────────────
  const jsxOutput = signal('')
  const jsxFormat = signal<OutputFormat>('html')

  async function renderJsxDoc() {
    rendering.set(true)
    try {
      // Doc primitives are factory functions returning `DocNode` — NOT
      // Pyreon JSX components (which return `VNode`). Each primitive takes
      // a single props object with `children` inside; the earlier shape
      // `Heading({ level: 1 }, 'text')` (children-as-2nd-arg) was wrong.
      // See `packages/fundamentals/document/src/tests/utils-coverage.test.ts`
      // for the canonical `{ children: ... }` form.
      const doc = Document({
        title: 'Invoice #1042',
        children: Page({
          children: [
            Heading({ level: 1, children: 'Invoice #1042' }),
            Text({ children: 'Billed to: Acme Corp.' }),
            Text({ children: 'Date: 2026-03-24' }),
            Table({
              columns: [{ header: 'Item' }, { header: 'Qty' }, { header: 'Price' }],
              rows: [
                ['Widget A', '10', '$50'],
                ['Widget B', '5', '$75'],
                ['Service Fee', '1', '$25'],
              ],
            }),
            Text({ bold: true, children: 'Total: $600' }),
          ],
        }),
      })
      const rendered = await render(doc, jsxFormat())
      if (typeof rendered === 'string') {
        jsxOutput.set(rendered)
      } else {
        jsxOutput.set(`[Binary output: ${(rendered as Uint8Array).byteLength} bytes]`)
      }
    } catch (err) {
      jsxOutput.set(`Error: ${(err as Error).message}`)
    } finally {
      rendering.set(false)
    }
  }

  const log = signal<string[]>([])
  const addLog = (msg: string) => log.update((l) => [...l.slice(-9), msg])

  return (
    <div>
      <h2>Document</h2>
      <p class="desc">
        Universal document rendering — one template, every output format. Builder pattern or node
        functions. Renderers are lazy-loaded on first use. Supports HTML, Markdown, plain text, CSV,
        email, Slack, and more.
      </p>

      {/* Builder pattern */}
      <div class="section">
        <h3>Builder Pattern — Team Report</h3>
        <p style="margin-bottom: 8px; font-size: 13px; opacity: 0.7">
          <code>createDocument().heading().table().text()</code> — chainable API, no JSX needed.
        </p>
        <div class="row" style="margin-bottom: 8px; flex-wrap: wrap">
          {formats.map((fmt) => (
            <button
              type="button"
              key={fmt.id}
              class={activeFormat() === fmt.id ? 'active' : ''}
              onClick={() => {
                activeFormat.set(fmt.id)
                addLog(`Format → ${fmt.label}`)
              }}
            >
              {fmt.label}
            </button>
          ))}
        </div>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            onClick={() => {
              renderDocument()
              addLog(`Rendered as ${activeFormat()}`)
            }}
            disabled={rendering()}
          >
            {() => (rendering() ? 'Rendering...' : 'Render')}
          </button>
          <button
            type="button"
            onClick={() => {
              teamData.update((d) => [
                ...d,
                [
                  ['Frank', 'Grace', 'Hank', 'Ivy'][Math.floor(Math.random() * 4)]!,
                  ['Engineering', 'Design', 'Marketing', 'Product'][Math.floor(Math.random() * 4)]!,
                  `$${100 + Math.floor(Math.random() * 80)}K`,
                  (3.5 + Math.random() * 1.5).toFixed(1),
                ],
              ])
              addLog(`Added team member (${teamData().length} total)`)
            }}
          >
            Add Team Member
          </button>
          <button
            type="button"
            onClick={() => {
              if (teamData().length > 1) {
                teamData.update((d) => d.slice(0, -1))
                addLog(`Removed last member (${teamData().length} total)`)
              }
            }}
          >
            Remove Last
          </button>
        </div>
        <pre style="background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto; max-height: 300px; white-space: pre-wrap; word-break: break-word">
          {() => output()}
        </pre>
      </div>

      {/* Node function pattern */}
      <div class="section">
        <h3>Node Functions — Invoice</h3>
        <p style="margin-bottom: 8px; font-size: 13px; opacity: 0.7">
          <code>
            Document({'{}'}, Page({'{}'}, Heading({'{}'}, ...)))
          </code>{' '}
          — direct node construction for full control.
        </p>
        <div class="row" style="margin-bottom: 8px; flex-wrap: wrap">
          {formats.map((fmt) => (
            <button
              type="button"
              key={`jsx-${fmt.id}`}
              class={jsxFormat() === fmt.id ? 'active' : ''}
              onClick={() => {
                jsxFormat.set(fmt.id)
                addLog(`Invoice format → ${fmt.label}`)
              }}
            >
              {fmt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            renderJsxDoc()
            addLog(`Rendered invoice as ${jsxFormat()}`)
          }}
          disabled={rendering()}
          style="margin-bottom: 8px"
        >
          {() => (rendering() ? 'Rendering...' : 'Render Invoice')}
        </button>
        <pre style="background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px; font-size: 13px; overflow-x: auto; max-height: 300px; white-space: pre-wrap; word-break: break-word">
          {() => jsxOutput() || 'Click "Render Invoice" to see output.'}
        </pre>
      </div>

      {/* Supported formats */}
      <div class="section">
        <h3>Supported Formats</h3>
        <p style="font-size: 13px; opacity: 0.7; line-height: 1.6">
          Text-based: <code>html</code>, <code>md</code>, <code>text</code>, <code>csv</code>,{' '}
          <code>email</code>, <code>svg</code>
          <br />
          Binary: <code>pdf</code>, <code>docx</code>, <code>xlsx</code>, <code>pptx</code>
          <br />
          Messaging: <code>slack</code>, <code>teams</code>, <code>discord</code>,{' '}
          <code>telegram</code>, <code>whatsapp</code>, <code>google-chat</code>
          <br />
          Wikis: <code>notion</code>, <code>confluence</code>
          <br />
          Custom: <code>registerRenderer('thermal', {'{ render(node) { ... } }'})</code>
        </p>
      </div>

      {/* Log */}
      <div class="section">
        <h3>Change Log</h3>
        <div class="log">
          {() =>
            log().length === 0
              ? 'Interact with the controls above to see changes.'
              : log().join('\n')
          }
        </div>
      </div>
    </div>
  )
}
