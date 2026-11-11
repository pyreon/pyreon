import { For } from '@pyreon/core'
import { announce, SkipLink, VisuallyHidden } from '@pyreon/a11y'
import { signal } from '@pyreon/reactivity'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, PaperButton, PaperHint } from '../kit/demo'
import { Eyebrow } from '../kit/type'

type Entry = { id: number; text: string; politeness: 'polite' | 'assertive' }

const Log = el
  .config({ name: 'A11yLog' })
  .attrs({ tag: 'ol', block: true, gap: 6 })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    padding: 12,
    minHeight: 180,
    borderRadius: radius.note,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'text'),
  }))

const Level = txt
  .config({ name: 'A11yLevel' })
  .attrs({ tag: 'span' })
  .theme(() => ({ marginRight: 8, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 10.5 }))
  .states((_t, m) => ({ polite: { color: tone(m, 'link') }, assertive: { color: tone(m, 'warn') } }))

const Row = el.config({ name: 'A11yRow' }).attrs({ block: true, contentDirection: 'inline', gap: 8 }).theme(() => ({ flexWrap: 'wrap' }))
const Box = el.config({ name: 'A11yBox' }).attrs({ block: true, gap: 12 }).theme(() => ({ position: 'relative' }))

const ACTIONS: { label: string; say: string; politeness?: 'assertive' }[] = [
  { label: 'Save', say: 'Settings saved' },
  { label: 'Copy link', say: 'Copied to clipboard' },
  { label: 'Search', say: '3 results for "pyreon"' },
  { label: 'Go offline', say: 'Connection lost. Retrying.', politeness: 'assertive' },
]

/**
 * Accessibility demo (`a11y.json` → demo): real `announce()`, `SkipLink`
 * and `VisuallyHidden` from `@pyreon/a11y`. Each button calls `announce()`
 * (which writes to the package's live region, so a screen reader really
 * speaks it); the log on the right mirrors what was sent.
 */
export default function DemoA11y() {
  const log = signal<Entry[]>([{ id: 0, text: 'Navigated to Settings — Acme', politeness: 'polite' }])
  const showHidden = signal(false)
  let id = 0
  const say = (t: string, politeness: 'polite' | 'assertive' = 'polite') => {
    announce(t, { politeness })
    log.set([{ id: ++id, text: t, politeness }, ...log.peek()].slice(0, 8))
  }

  return (
    <DemoGrid>
      <DemoSurface>
        <Box>
          <SkipLink href="#a11y-demo-main" style={{ position: 'absolute' }}>
            Skip to content
          </SkipLink>
          <Row id="a11y-demo-main">
            <For each={ACTIONS} by={(a) => a.label}>
              {(a) => (
                <PaperButton type="button" variant={a.label === 'Save' ? 'primary' : 'secondary'} onClick={() => say(a.say, a.politeness)}>
                  {a.label}
                </PaperButton>
              )}
            </For>
          </Row>
          <PaperHint>Tab into this box: a skip link appears first.</PaperHint>
          <label>
            <input type="checkbox" checked={() => showHidden()} onChange={(e: Event) => showHidden.set((e.target as HTMLInputElement).checked)} />{' '}
            Show visually hidden text
          </label>
          <p>
            Price: <b>$129</b>{' '}
            {() =>
              showHidden() ? <span>(including VAT, billed yearly)</span> : <VisuallyHidden>including VAT, billed yearly</VisuallyHidden>
            }
          </p>
        </Box>
      </DemoSurface>
      <DemoPanel>
        <Eyebrow>screen reader output</Eyebrow>
        <Log aria-hidden="true">
          <For each={() => log()} by={(e) => e.id}>
            {(e) => (
              <li>
                <Level state={e.politeness}>{e.politeness}</Level>
                {e.text}
              </li>
            )}
          </For>
        </Log>
      </DemoPanel>
    </DemoGrid>
  )
}
