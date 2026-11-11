import { For, h, onMount, type VNode } from '@pyreon/core'
import { kinetic } from '@pyreon/kinetic'
import { blurIn, bounceInUp, fade, fadeUp, flipX, rotateIn, scaleIn, slideRight, zoomOut } from '@pyreon/kinetic-presets'
import { signal } from '@pyreon/reactivity'
import { font, paper, radius } from '../theme'
import { el, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { Pill } from '../kit/controls'
import { DemoGrid } from '../kit/demo'
import { ButtonRow, CardNote, CardSegmented, DemoStack } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Motion demo (`kinetic.json` → demo): nine real presets from
 * `@pyreon/kinetic-presets` (named imports, so the page ships nine of the
 * 122). The box is `kinetic('div').preset(p)` driven by a `show` signal; the
 * panel is `kinetic('div').collapse()`. Chains are immutable, so every
 * component is defined once here at module scope. Picking a preset remounts
 * the box, which replays the enter; Toggle flips `show`, which runs the
 * leave; the panel collapses to 0 and back to auto. Under `prefers-reduced-motion`
 * kinetic skips the visuals by itself (the state still changes).
 */
const PRESETS = { fade, fadeUp, scaleIn, slideRight, flipX, blurIn, zoomOut, rotateIn, bounceInUp } as const
type PresetName = keyof typeof PRESETS
const NAMES = Object.keys(PRESETS) as PresetName[]

const BOXES = Object.fromEntries(NAMES.map((n) => [n, kinetic('div').preset(PRESETS[n])])) as Record<PresetName, ReturnType<typeof kinetic<'div'>>>
// Collapse mode: height 0 ↔ auto. (Stagger is left out until #4359 / #4380 are fixed, as the content says.)
const Panel = kinetic('div').collapse()

const PANEL_LINES = ['Invoice #1042 paid', 'New comment on Launch plan', 'Ada joined the team', 'Weekly report ready'] as const

const BoxStage = el
  .config({ name: 'KineticStage' })
  .attrs({ block: true, contentAlignX: 'center', contentAlignY: 'center' })
  .theme(() => ({ height: 150, extendCss: `perspective: 600px; & > div { ${boxCss} }` }))

const boxCss = `
  display: grid; place-items: center; width: 132px; height: 92px; border-radius: 16px;
  background: ${paper.accent}; color: ${paper.accentText}; font: 600 17px ${font.system};
`
const listCss = `
  list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; width: 100%;
  & > li { padding: 11px 14px; border-radius: 10px; border: 1px solid ${paper.line}; background: ${paper.field}; color: ${paper.text}; font: 14px ${font.system}; }
`
const ListLook = el.config({ name: 'KineticListLook' }).attrs({ block: true }).theme(() => ({ extendCss: `& ul { ${listCss} }` }))

const State = txt
  .config({ name: 'KineticState' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontFamily: font.mono, fontSize: 12.5, color: paper.fog, borderRadius: radius.note }))

/**
 * Mounts hidden and shows on the next tick, so a freshly mounted kinetic
 * component runs its enter. (`appear` would do this, but with an initially
 * true `show` it renders the children twice: #4380.)
 */
function Entering(props: { render: (visible: () => boolean) => VNode }) {
  const visible = signal(false)
  onMount(() => {
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    const id = setTimeout(() => visible.set(true), 30)
    return () => clearTimeout(id)
  })
  return props.render(visible)
}

export default function DemoKinetic() {
  const preset = signal<PresetName>('fadeUp')
  const shown = signal(true)
  const open = signal(true)

  const pick = (p: PresetName) => {
    shown.set(true)
    preset.set(p)
  }

  const code = () =>
    `const Box = kinetic('div').preset(${preset()})\n<Box show={() => shown()}>Hello</Box>  // shown: ${shown()}\n\nconst Panel = kinetic('div').collapse()\n<Panel show={() => open()}>…</Panel>  // open: ${open()}`

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>preset</Eyebrow>
          <CardSegmented label="Preset" options={NAMES} value={() => preset()} onChange={pick} />
          <ButtonRow>
            <Pill variant="solid" onClick={() => shown.update((v) => !v)}>
              Toggle
            </Pill>
            <Pill onClick={() => open.update((v) => !v)}>{() => (open() ? 'Collapse the panel' : 'Expand the panel')}</Pill>
          </ButtonRow>
          <CodeBlock code={code()} label="The chain for the selected preset" />
          <CardNote>Picking a preset replays its enter; Toggle runs the leave. With reduced motion on, kinetic skips the animation and only the state changes.</CardNote>
        </DemoStack>
      </GlowCard>
      <DemoSurface aria-label="Motion stage">
        <BoxStage>
          {/* Keyed by preset: a new key mounts a new box, which enters. */}
          <For each={() => [preset()]} by={(k) => k}>
            {(k) => <Entering render={(visible) => h(BOXES[k], { show: () => visible() && shown() }, 'Hello')} />}
          </For>
        </BoxStage>
        <State aria-live="polite">{() => `show: ${shown()}`}</State>
        <ListLook>
          <Panel show={() => open()}>
            <ul>
              <For each={PANEL_LINES} by={(t) => t}>
                {(t) => <li>{t}</li>}
              </For>
            </ul>
          </Panel>
        </ListLook>
      </DemoSurface>
    </DemoGrid>
  )
}
