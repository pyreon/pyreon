import { For, onMount, onUnmount, Show } from '@pyreon/core'
// This module IS the lazy chunk: registry.tools.ts loads it through island(() => import(…)).
// pyreon-lint-disable-next-line pyreon/no-eager-import
import { Document, download, Heading, List, ListItem, Page, render, Table, Text } from '@pyreon/document'
import type { TextOutputFormat } from '@pyreon/document'
import { signal, watch } from '@pyreon/reactivity'
import { font, paper, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { Segmented } from '../kit/controls'
import { Eyebrow } from '../kit/type'

type Quarter = 'Q3' | 'Q4'
type Tab = 'html' | 'md' | 'csv' | 'slack' | 'email' | 'json'

const QUARTERS: readonly Quarter[] = ['Q3', 'Q4']
const TABS: readonly Tab[] = ['html', 'md', 'csv', 'slack', 'email', 'json']
const ALL_FORMATS = ['html', 'pdf', 'docx', 'xlsx', 'pptx', 'email', 'md', 'text', 'csv', 'svg', 'json', 'jsonl', 'slack', 'teams', 'discord', 'telegram', 'notion', 'confluence', 'whatsapp', 'google-chat'] as const

const DATA: Record<Quarter, { rows: [string, string][]; growth: string; best: string }> = {
  Q3: { rows: [['US', '$910K'], ['EU', '$720K'], ['APAC', '$380K']], growth: '6%', best: 'EU renewals' },
  Q4: { rows: [['US', '$1M'], ['EU', '$800K'], ['APAC', '$420K']], growth: '11%', best: 'APAC new accounts' },
}

/**
 * The ONE template, authored in JSX. `render()` from @pyreon/document
 * resolves a JSX tree itself (components are invoked with their children),
 * so this path is not affected by #4303, which drops JSX children only in
 * @pyreon/connector-document's extraction.
 */
function report(q: Quarter) {
  const d = DATA[q]
  return (
    <Document title={`${q} 2026 sales report`} author="Finance">
      <Page>
        <Heading>Sales report</Heading>
        <Text>{`${q} 2026 performance summary. Revenue grew ${d.growth} on the previous quarter.`}</Text>
        <Table columns={['Region', 'Revenue']} rows={d.rows} />
        <List>
          <ListItem>{`Strongest growth: ${d.best}`}</ListItem>
          <ListItem>Churn held under 2%</ListItem>
        </List>
      </Page>
    </Document>
  )
}

/** The Slack payload is one JSON line; indent it so it reads. */
const pretty = (tab: Tab, out: string): string => {
  if (tab !== 'slack' && tab !== 'json') return out
  try {
    return JSON.stringify(JSON.parse(out), null, 2)
  } catch {
    return out
  }
}

const Head = el
  .config({ name: 'DocDemoHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: { xs: 16, sm: 20 },
    paddingRight: { xs: 16, sm: 20 },
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Body = el
  .config({ name: 'DocDemoBody' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    minWidth: 0,
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 270px' },
  }))

const Output = el
  .config({ name: 'DocDemoOutput' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme((_t, m) => ({
    minWidth: 0,
    padding: { xs: 16, sm: 22 },
    borderRight: { xs: 'none', lg: `1px solid ${tone(m, 'line')}` },
    borderBottom: { xs: `1px solid ${tone(m, 'line')}`, lg: 'none' },
  }))

const Source = el
  .config({ name: 'DocDemoSource' })
  .attrs({ tag: 'pre', block: true, contentAlignX: 'left', contentAlignY: 'top' })
  .theme((_t, m) => ({
    margin: 0,
    minWidth: 0,
    height: { xs: 336, lg: 430 },
    overflow: 'auto',
    padding: 16,
    borderRadius: radius.control,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    color: tone(m, 'text'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    focus: focusRing(m),
  }))

/** The HTML output is a whole document: it is shown in a sandboxed frame, on paper, in both themes. */
const Frame = el
  .config({ name: 'DocDemoFrame' })
  .attrs({ block: true })
  .theme(() => ({
    minWidth: 0,
    height: { xs: 336, lg: 430 },
    borderRadius: radius.control,
    overflow: 'hidden',
    backgroundColor: paper.bg,
    boxShadow: paper.ring,
    extendCss: '& > iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; }',
  }))

/**
 * The kit's Segmented does not wrap its buttons on a phone (its flex row sits
 * on an inner wrapper), so six formats scroll inside this strip instead of
 * being clipped.
 */
const TabStrip = el
  .config({ name: 'DocDemoTabStrip' })
  .theme(() => ({ flex: '0 1 auto', minWidth: 0, maxWidth: '100%', overflowX: 'auto', extendCss: 'scrollbar-width: thin;' }))

const Side = el
  .config({ name: 'DocDemoSide' })
  .attrs({ block: true, gap: 12 })
  .theme(() => ({ minWidth: 0, padding: { xs: 16, sm: 20 } }))

const Chips = el
  .config({ name: 'DocDemoChips' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const Chip = txt
  .config({ name: 'DocDemoChip' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: 11,
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    color: tone(m, 'fog'),
  }))
  .states((_t, m) => ({
    idle: {},
    on: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'text') },
  }))

const Small = txt
  .config({ name: 'DocDemoSmall' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: text.caption.lineHeight, color: tone(m, 'fog') }))

const Downloads = el
  .config({ name: 'DocDemoDownloads' })
  .attrs({ block: true, contentDirection: 'inline', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap' }))

const DownloadButton = el
  .config({ name: 'DocDemoDownload' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 34,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

const LABEL: Record<Tab, string> = { html: 'html', md: 'md', csv: 'csv', slack: 'slack', email: 'email', json: 'json' }

/**
 * Document demo (`document.json` → demo): one JSX template, rendered live
 * in the browser by `@pyreon/document`'s `render()` to the format the
 * visitor picks. The quarter switch changes the data and every format
 * re-renders. The PDF goes through the package's `download()`, which loads
 * pdfmake only on that click.
 */
export default function DemoDocument() {
  const tab = signal<Tab>('html')
  const quarter = signal<Quarter>('Q4')
  const output = signal('')
  const busy = signal(false)
  const status = signal('')

  // A slow first render (the renderer chunk loading) must not overwrite a newer one.
  let version = 0
  const run = async (t: Tab, q: Quarter) => {
    const mine = ++version
    const out = await render(report(q), t satisfies TextOutputFormat)
    if (mine === version) output.set(pretty(t, typeof out === 'string' ? out : ''))
  }
  let stop: (() => void) | undefined
  // Rendering is async and client-side: start once hydrated, so the server and the first client render agree.
  onMount(() => {
    stop = watch(
      () => [tab(), quarter()] as const,
      ([t, q]) => void run(t, q),
      { immediate: true },
    )
  })
  onUnmount(() => {
    version++
    stop?.()
  })

  // `srcdoc` is not in @pyreon/core's iframe attribute types (#4392), so the frame gets it by ref.
  let stopFrame: (() => void) | undefined
  const showHtml = (el: HTMLIFrameElement | null) => {
    stopFrame?.()
    stopFrame = undefined
    if (el === null) return
    stopFrame = watch(
      () => output(),
      (html) => {
        el.srcdoc = html
      },
      { immediate: true },
    )
  }
  onUnmount(() => stopFrame?.())

  const savePdf = async () => {
    // A second click while one render runs is ignored; the status line says what is happening.
    if (busy.peek()) return
    const name = `${quarter.peek().toLowerCase()}-sales-report.pdf`
    busy.set(true)
    status.set('Loading pdfmake and rendering…')
    try {
      await download(report(quarter.peek()), name)
      status.set(`Saved ${name}, rendered in this tab.`)
    } catch (e) {
      status.set(`Could not render ${name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      busy.set(false)
    }
  }

  return (
    <GlowCard padding="flush">
      <Head>
        <TabStrip>
          <Segmented label="Output format" options={TABS} value={() => tab()} onChange={(v) => tab.set(v)} />
        </TabStrip>
        <Segmented label="Quarter" options={QUARTERS} value={() => quarter()} onChange={(v) => quarter.set(v)} />
      </Head>
      <Body>
        <Output>
          <Show
            when={() => tab() === 'html'}
            fallback={
              <Source tabIndex={0} aria-label={() => `render(report, '${LABEL[tab()]}') output`}>
                {() => output()}
              </Source>
            }
          >
            <Frame>
              <iframe sandbox="" title="render(report, 'html') output" ref={showHtml} />
            </Frame>
          </Show>
        </Output>
        <Side>
          <Eyebrow>all 20 formats</Eyebrow>
          <Chips aria-label="Formats @pyreon/document renders">
            <For each={ALL_FORMATS} by={(f) => f}>
              {(f) => <Chip state={f === tab() ? 'on' : 'idle'}>{f}</Chip>}
            </For>
          </Chips>
          <Small>Binary formats load their library on first use: this button fetches pdfmake, renders the same tree and saves it.</Small>
          {/* No .docx button yet: render(node, 'docx') calls Packer.toBuffer, which throws
              "nodebuffer is not supported by this platform" in a browser (#4389). */}
          <Downloads>
            <DownloadButton type="button" onClick={() => void savePdf()}>
              Download .pdf
            </DownloadButton>
          </Downloads>
          <Small aria-live="polite">{() => status()}</Small>
        </Side>
      </Body>
    </GlowCard>
  )
}
