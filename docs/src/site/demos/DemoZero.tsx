import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { font, radius, text } from '../theme'
import { el, focusRing, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { SimulatedNote } from '../kit/demo-parts'
import { Eyebrow, Heading } from '../kit/type'
import { KitScope } from '../kit/scope'

/**
 * Zero demo (`zero.json` → demo): a sample `src/routes` folder; pick a file
 * to see the render mode its one export selects and what that means at
 * build and request time. Nothing is rendered on a server here, so the panel
 * says it is an illustration of what `zero build` decides.
 */
type Mode = 'ssg' | 'isr' | 'ssr' | 'spa' | 'api'

interface RouteFile {
  file: string
  url: string
  mode: Mode
  title: string
  what: string
  renders: string
  cached: string
  js: string
  code: string
}

const ROUTES: readonly RouteFile[] = [
  {
    file: 'index.tsx',
    url: '/',
    mode: 'ssg',
    title: 'Built once, served from a CDN',
    what: 'Rendered to static HTML at build time.',
    renders: 'at build',
    cached: 'CDN, until the next deploy',
    js: 'only interactive parts',
    code: "export const renderMode = 'ssg'",
  },
  {
    file: 'blog/[slug].tsx',
    url: '/blog/:slug',
    mode: 'isr',
    title: 'Cached, refreshed in the background',
    what: 'Rendered on the first request, cached, then refreshed on a timer or when you invalidate a tag.',
    renders: 'first request, then after isr.revalidate (60 s by default)',
    cached: 'ISR cache with tag invalidation',
    js: 'only interactive parts',
    code: "export const renderMode = 'isr'",
  },
  {
    file: 'account.tsx',
    url: '/account',
    mode: 'ssr',
    title: 'Rendered per request',
    what: 'Rendered on the server for each visitor, with streaming available for Suspense boundaries.',
    renders: 'every request',
    cached: 'none, personalised',
    js: 'hydrated',
    code: "export const renderMode = 'ssr'",
  },
  {
    file: '(app)/dashboard.tsx',
    url: '/dashboard',
    mode: 'spa',
    title: 'Runs in the browser',
    what: 'A static shell; the page renders client-side. Folders in parentheses group files without changing the URL.',
    renders: 'in the browser',
    cached: 'static shell',
    js: 'the app (no server HTML to hydrate)',
    code: "export const renderMode = 'spa'",
  },
  {
    file: 'api/posts.ts',
    url: '/api/posts',
    mode: 'api',
    title: 'An API endpoint',
    what: 'Export GET, POST, PUT or DELETE and it becomes an endpoint, with the same middleware as your pages.',
    renders: 'every request',
    cached: 'your headers',
    js: 'none',
    code: 'export function GET() { … }\nexport function POST({ request }) { … }',
  },
]

const Layout = el
  .config({ name: 'ZeroDemo' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' },
    gap: { xs: 20, md: 28 },
  }))

const Tree = el.config({ name: 'ZeroTree' }).attrs({ tag: 'ul', block: true, gap: 6, contentAlignX: 'block' }).theme(() => ({ listStyle: 'none', margin: 0, marginTop: 10, padding: 0 }))

const FileButton = el
  .config({ name: 'ZeroFile' })
  .attrs<{ type?: 'button'; onClick?: () => void; 'aria-pressed'?: string | (() => string) }>({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignX: 'spaceBetween',
    contentAlignY: 'center',
    gap: 10,
  })
  .theme((_t, m) => ({
    width: '100%',
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 10,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: text.mono.size + 0.5,
    textAlign: 'left',
    cursor: 'pointer',
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    extendCss: `&[aria-pressed='true'] { border-color: ${tone(m, 'currentBorder')}; background: ${tone(m, 'currentFill')}; color: ${tone(m, 'text')}; }`,
  }))

const ModeChip = txt
  .config({ name: 'ZeroMode' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    flexShrink: 0,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 2,
    paddingBottom: 2,
    border: '1px solid',
    borderRadius: radius.pill,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    borderColor: tone(m, 'line2'),
  }))
  .states((_t, m) => ({
    ssg: { color: tone(m, 'ok') },
    isr: { color: tone(m, 'link') },
    ssr: { color: tone(m, 'accentText') },
    spa: { color: tone(m, 'warmText') },
    api: { color: tone(m, 'mist') },
  }))

const Dim = txt
  .config({ name: 'ZeroDim' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 10, fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Detail = el.config({ name: 'ZeroDetail' }).attrs({ block: true, gap: 14 }).theme(() => ({ minWidth: 0 }))

const Row = el
  .config({ name: 'ZeroRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({ flexWrap: 'wrap', fontFamily: font.mono, fontSize: 13, color: tone(m, 'fog') }))

const Body = txt
  .config({ name: 'ZeroBody' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

const Props = el
  .config({ name: 'ZeroProps' })
  .attrs({ tag: 'dl', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
    gap: 10,
    margin: 0,
    extendCss: `& > div { padding: 10px 12px; border: 1px solid ${tone(m, 'line')}; border-radius: ${radius.note}px; background: ${tone(m, 'well')}; } & dd { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: ${tone(m, 'text')}; }`,
  }))

const Well = el
  .config({ name: 'ZeroCode' })
  .attrs({ block: true })
  .theme((_t, m) => ({ border: '1px solid', borderColor: tone(m, 'line'), borderRadius: radius.note, backgroundColor: tone(m, 'well') }))

export default function DemoZero() {
  const selected = signal(0)
  const current = () => ROUTES[selected()] as RouteFile

  return (
    <KitScope>
      <GlowCard>
        <Layout>
          <div>
            <Eyebrow>src/routes</Eyebrow>
            <Tree aria-label="Route files">
              <For each={ROUTES.map((r, i) => ({ r, i }))} by={(x) => x.r.file}>
                {(x) => (
                  <li>
                    <FileButton type="button" aria-pressed={() => (selected() === x.i ? 'true' : 'false')} onClick={() => selected.set(x.i)}>
                      <span>{x.r.file}</span>
                      <ModeChip state={x.r.mode}>{x.r.mode}</ModeChip>
                    </FileButton>
                  </li>
                )}
              </For>
            </Tree>
            <Dim>_layout.tsx · _404.tsx · _error.tsx · _loading.tsx</Dim>
          </div>
          <Detail aria-live="polite">
            <Row>
              {() => <ModeChip state={current().mode}>{current().mode}</ModeChip>}
              <span>{() => current().url}</span>
            </Row>
            <Heading tag="h3" size="card">
              {() => current().title}
            </Heading>
            <Body>{() => current().what}</Body>
            <Props>
              <div>
                <Eyebrow tag="dt">renders</Eyebrow>
                <dd>{() => current().renders}</dd>
              </div>
              <div>
                <Eyebrow tag="dt">cached</Eyebrow>
                <dd>{() => current().cached}</dd>
              </div>
              <div>
                <Eyebrow tag="dt">javascript</Eyebrow>
                <dd>{() => current().js}</dd>
              </div>
            </Props>
            <Well>
              <CodeBlock code={current().code} label={`${current().file}: the export that picks the mode`} />
            </Well>
            <SimulatedNote>Illustration of what zero build decides per route. Nothing renders on a server here.</SimulatedNote>
          </Detail>
        </Layout>
      </GlowCard>
    </KitScope>
  )
}
