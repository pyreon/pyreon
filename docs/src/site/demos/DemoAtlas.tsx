import { onMount, onUnmount, Show } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { font, radius, text } from '../theme'
import { el, focusRing, type LinkAttrs, tone, txt } from '../kit/bases'
import { colorMode } from '../color-mode'
import { Code, Eyebrow } from '../kit/type'
import { KitScope } from '../kit/scope'

/**
 * Atlas demo (`atlas.json` → demo): the REAL workbench. `atlas build` compiles
 * `examples/atlas-workshop` into a static site (docs/scripts/build-atlas-demo.ts
 * → docs/public/demos/atlas/), with the verdicts `atlas scan` computed for
 * every scenario baked in; this island embeds it. Nothing here is a
 * screenshot: Button → Empty is red because the scan failed it, and the A11y
 * tab runs its structural check (and axe-core, on demand) on the live preview.
 *
 * Embedded in an iframe, not mounted inline: `<Workbench>` owns its page
 * (a global html/body reset, ↑↓ and ⌘K on the window).
 *
 * The server render holds the link to the full-screen workbench and the steps
 * to try; the iframe mounts on the client, in the site's colour mode, and
 * follows a mode switch through the workbench model (`__ATLAS_MODEL__`, the
 * surface Atlas exposes to embedding hosts) without reloading.
 */
const SRC = '/demos/atlas/index.html'

type AtlasWindow = Window & { __ATLAS_MODEL__?: { dark: { set: (v: boolean) => void } } }

const Card = el
  .config({ name: 'AtlasDemoCard' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: radius.card,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
  }))

const Head = el
  .config({ name: 'AtlasDemoHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const Steps = txt
  .config({ name: 'AtlasDemoSteps' })
  .attrs({ tag: 'div' })
  .theme((_t, m) => ({
    flex: '1 1 420px',
    minWidth: 0,
    extendCss: '& > ol { margin: 0; padding-left: 18px; }',
    fontFamily: font.sans,
    fontSize: text.ui.size,
    lineHeight: 1.6,
    color: tone(m, 'mist'),
  }))

const OpenLink = el
  .config({ name: 'AtlasDemoOpen' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    flexShrink: 0,
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'link'),
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    focus: focusRing(m),
  }))

const Stage = el
  .config({ name: 'AtlasDemoStage' })
  .attrs({ block: true, contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    position: 'relative',
    height: { xs: 620, md: 680 },
    backgroundColor: tone(m, 'well'),
    extendCss: '& > iframe { display: block; width: 100%; height: 100%; border: 0; }',
  }))

const Waiting = txt
  .config({ name: 'AtlasDemoWaiting' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, padding: 24, textAlign: 'center', fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Foot = txt
  .config({ name: 'AtlasDemoFoot' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    display: 'block',
    margin: 0,
    paddingTop: 10,
    paddingBottom: 12,
    paddingLeft: 18,
    paddingRight: 18,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))

export default function DemoAtlas() {
  const ready = signal(false)
  // The colour mode at mount picks the iframe's first appearance; later
  // switches go through the workbench model.
  let firstDark = true
  let frame: HTMLIFrameElement | null = null

  onMount(() => {
    firstDark = colorMode() === 'dark'
    ready.set(true)
    return undefined
  })

  const sync = effect(() => {
    const dark = colorMode() === 'dark'
    const model = (frame?.contentWindow as AtlasWindow | null | undefined)?.__ATLAS_MODEL__
    model?.dark.set(dark)
  })
  onUnmount(() => sync.dispose())

  return (
    <KitScope>
      <Card>
        <Head>
          <Steps>
            <ol>
            <li>
              In the sidebar (☰ on a phone), <b>Button</b> lists its scenarios. Select <b>Empty</b>: its dot is red.
            </li>
            <li>
              Open the <b>A11y</b> tab: “Accessible name: interactive element with no name”. <b>Run axe</b> audits the live preview.
            </li>
            <li>
              Back in <b>Controls</b>, give it a label and the check passes.
            </li>
            </ol>
          </Steps>
          <OpenLink href={SRC} target="_blank" rel="noopener">
            open full screen ↗
          </OpenLink>
        </Head>
        <Stage>
          <Show
            when={() => ready()}
            fallback={
              <Waiting>
                The Atlas workbench loads here. <Code>open full screen</Code> works without it.
              </Waiting>
            }
          >
            {() => (
              <iframe
                ref={(n: HTMLIFrameElement | null) => {
                  frame = n
                }}
                src={`${SRC}?c=button&dark=${firstDark ? '1' : '0'}`}
                title="Atlas workbench: the atlas-workshop sample library"
                loading="lazy"
              />
            )}
          </Show>
        </Stage>
        <Foot>
          <Eyebrow tag="span">real workbench</Eyebrow> · built by <Code>atlas build</Code> from examples/atlas-workshop; scenario verdicts from{' '}
          <Code>atlas scan</Code>
        </Foot>
      </Card>
    </KitScope>
  )
}
