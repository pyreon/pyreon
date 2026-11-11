import { For } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'
import { DemoGrid, DemoPanel } from '../kit/demo'
import { Eyebrow } from '../kit/type'
import { expand, FILES, OWNERS, type Plugin, PLUGINS, REPORT_COUNTS, REPORT_TITLE, REPORT_VERIFY } from './_capture-lathe'
import { Replay, type ReplayLine } from './_replay-b'

const Grid = el
  .config({ name: 'LatheDemoPlugins' })
  .attrs({ tag: 'fieldset', block: true })
  .theme(() => ({
    margin: 0,
    marginTop: 12,
    padding: 0,
    border: 'none',
    minWidth: 0,
  }))

// Element lays out with flex; doubled `&&` outranks it for a two-column grid.
const Cells = el
  .config({ name: 'LatheDemoCells' })
  .attrs({ block: true })
  .theme(() => ({ extendCss: '&& { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }' }))

const Toggle = el
  .config({ name: 'LatheDemoToggle' })
  .attrs<ButtonAttrs>({ tag: 'button', contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 8 })
  .theme((_t, m) => ({
    minHeight: 42,
    flexWrap: 'wrap',
    textAlign: 'left',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: radius.control,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: 12.5,
    transition: `border-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'strong') },
  }))
  .states((_t, m) => ({
    off: {},
    required: { borderStyle: 'dashed', borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
  }))

const Tag = txt
  .config({ name: 'LatheDemoTag' })
  .attrs({ tag: 'small' })
  .theme((_t, m) => ({ fontSize: 10.5, color: tone(m, 'fog') }))

const Status = txt
  .config({ name: 'LatheDemoStatus' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ minHeight: 20, margin: 0, marginTop: 12, fontFamily: font.sans, fontSize: text.caption.size, color: tone(m, 'fog') }))

/**
 * Lathe demo (`lathe.json` → demo): toggle plugins, see what `lathe generate`
 * writes for the Bookshelf example spec. The dependency closure is Lathe's
 * own plugin graph and walk; the file list and every line of the report are
 * the real CLI's, captured over all 1023 selections (`_capture-lathe.ts`).
 */
export default function DemoLathe() {
  const selected = signal<readonly Plugin[]>(['queries'])
  const note = signal('')

  const closure = computed(() => expand(selected()))
  const files = computed(() => {
    const on = new Set(selected())
    return FILES.filter((_f, i) => OWNERS[i]?.some((p) => on.has(p)))
  })
  const key = computed(() => selected().join(','))

  const toggle = (p: Plugin) => {
    const cur = selected.peek()
    if (cur.includes(p)) {
      if (cur.length === 1) {
        note.set('Keep at least one plugin selected.')
        return
      }
      selected.set(cur.filter((x) => x !== p))
    } else {
      // Kept in the CLI's canonical order, as `--plugins` would list them.
      selected.set(PLUGINS.filter((x) => x === p || cur.includes(x)))
    }
    note.set('')
  }

  const report = computed<ReplayLine[]>(() => {
    const sel = selected()
    const added = closure().filter((p) => !sel.includes(p))
    const list = files()
    return [
      { k: 'cmd', t: `$ lathe generate openapi.yaml --target web --plugins ${sel.join(',')} --out src/gen` },
      { k: 'out', t: '' },
      { k: 'head', t: REPORT_TITLE },
      { k: 'out', t: REPORT_COUNTS },
      ...(added.length > 0 ? [{ k: 'dim' as const, t: `  plugins: ${sel.join(', ')} (+${added.join(', +')} - required by them)` }] : []),
      { k: 'out', t: '' },
      ...list.map((f) => ({ k: 'ok' as const, t: `  + src/gen/${f}` })),
      { k: 'out', t: '' },
      { k: 'out', t: `  ${list.length} of ${list.length} file(s) written` },
      { k: 'out', t: '' },
      { k: 'dim', t: REPORT_VERIFY },
    ]
  })

  return (
    <DemoGrid>
      <DemoPanel note="Dashed: not selected, but a selected plugin's output imports it, so Lathe adds it.">
        <Eyebrow>plugins</Eyebrow>
        <Grid aria-label="Lathe plugins">
          <Cells>
          <For each={PLUGINS} by={(p) => p}>
            {(p) => (
              <Toggle
                type="button"
                aria-pressed={() => (selected().includes(p) ? 'true' : 'false')}
                // pyreon-lint-disable-next-line pyreon/no-signal-in-props
                state={!selected().includes(p) && closure().includes(p) ? 'required' : 'off'}
                onClick={() => toggle(p)}
              >
                <span>{p}</span>
                <Tag>{() => (selected().includes(p) ? 'selected' : closure().includes(p) ? 'required' : '')}</Tag>
              </Toggle>
            )}
          </For>
          </Cells>
        </Grid>
        <Status aria-live="polite">{() => note() || `${files().length} files`}</Status>
      </DemoPanel>
      <Replay
        lines={() => report()}
        replayKey={() => key()}
        autoplay
        delay={45}
        label="lathe generate output"
        title="examples/lathe-bookshelf"
        command="lathe generate"
        source="every line as the CLI prints it for this selection, captured from examples/lathe-bookshelf/openapi.yaml, 2026-11-11"
      />
    </DemoGrid>
  )
}
