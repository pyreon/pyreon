import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { keyframes } from '@pyreon/styler'
import { font, motion, paper, radius, text, weight } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from './bases'
import { GlowCard } from './cards'
import { AutoGrid } from './layout'

/**
 * Building blocks for the live demos on product pages: the meter panel on
 * the dark card (live counters with the signal pulse) and the controls of
 * the paper "real app" surface (`DemoSurface`), whose colours are fixed in
 * both themes.
 */

/** Two columns from 960px: the app on one side, what it does on the other. */
export function DemoGrid(props: { children?: VNodeChild }) {
  return (
    <AutoGrid cols={2} gap={16}>
      {props.children}
    </AutoGrid>
  )
}

// The pulse restarts on every change by alternating between two identical
// animations (a CSS animation only replays when its name changes).
const pulseFrames = `from { box-shadow: 0 0 0 0 ${motion.pulse.ring}; border-color: ${motion.pulse.edge}; } to { box-shadow: 0 0 0 10px ${motion.pulse.fade}; }`
const pulseA = keyframes`${pulseFrames}`
// A distinct body (a no-op 0% step) so the two animations hash to two names.
const pulseB = keyframes`0% { opacity: 1; } ${pulseFrames}`

const MeterRow = el
  .config({ name: 'MeterRow' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 14,
    paddingRight: 14,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'mist'),
  }))
  .states(() => ({
    idle: {},
    a: { extendCss: `animation: ${pulseA} ${motion.pulse.duration * 3}ms ${motion.pulse.easing}; @media (prefers-reduced-motion: reduce) { animation: none; }` },
    b: { extendCss: `animation: ${pulseB} ${motion.pulse.duration * 3}ms ${motion.pulse.easing}; @media (prefers-reduced-motion: reduce) { animation: none; }` },
  }))

const MeterValue = txt
  .config({ name: 'MeterValue' })
  .attrs({ tag: 'b' })
  .theme((_t, m) => ({
    fontFamily: font.sans,
    fontSize: 22,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
    extendCss: 'font-variant-numeric: tabular-nums;',
  }))

const MeterList = el
  .config({ name: 'Meters' })
  .attrs({ tag: 'ul', block: true, gap: 8 })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))

export interface MeterItem {
  label: VNodeChild
  value: () => number | string
}

function Meter(props: MeterItem) {
  let n = -1
  // Runs once per change of the value: idle on the first read, then a/b.
  const state = computed(() => {
    props.value()
    n++
    return n === 0 ? ('idle' as const) : n % 2 ? ('a' as const) : ('b' as const)
  })
  return (
    // The compiler wraps this read in _rp(), so the row re-styles on each change.
    // pyreon-lint-disable-next-line pyreon/no-signal-in-props
    <MeterRow state={state()}>
      <span>{props.label}</span>
      <MeterValue>{() => String(props.value())}</MeterValue>
    </MeterRow>
  )
}

/** `.meter` — labelled live counters; a row pulses when its value changes. */
export function Meters(props: { items: readonly MeterItem[]; label: string }) {
  return (
    <MeterList aria-label={props.label}>
      <For each={props.items} by={(i) => String(i.label)}>
        {(i) => <Meter label={i.label} value={i.value} />}
      </For>
    </MeterList>
  )
}

const NoteText = txt
  .config({ name: 'DemoNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.ui.size, lineHeight: 1.6, color: tone(m, 'fog') }))

/** The dark explainer card beside a demo. */
export function DemoPanel(props: { note?: string | undefined; children?: VNodeChild }) {
  return (
    <GlowCard padding="compact">
      {props.children}
      {props.note ? <NoteText>{props.note}</NoteText> : null}
    </GlowCard>
  )
}

// ─── Paper-surface controls (fixed light palette) ─────────────────────────

export const PaperLabel = txt
  .config({ name: 'PaperLabel' })
  .attrs<{ for?: string | undefined }>({ tag: 'label' })
  .theme(() => ({ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: paper.text }))

/**
 * Wraps a native `<input>` on the paper surface and styles it. A wrapper (not
 * a styled input) so `form.register()` output, whose `disabled` / `readOnly`
 * / `aria-*` are accessors, spreads straight onto the real element.
 */
export const PaperField = el
  .config({ name: 'PaperField' })
  .attrs({ block: true })
  .theme(() => ({
    extendCss: `
      & > input {
        box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border-radius: 8px;
        border: 1px solid ${paper.line}; background: ${paper.field}; color: ${paper.text};
        font: 14px ${font.system};
      }
      & > input::placeholder { color: ${paper.fog}; }
      & > input[aria-invalid='true'] { border-color: ${paper.err}; }
      & > input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 1px; }
    `,
  }))

export const PaperError = txt
  .config({ name: 'PaperError' })
  .attrs({ tag: 'p' })
  .theme(() => ({ minHeight: 18, margin: 0, marginTop: 5, marginBottom: 12, fontSize: text.caption.size, color: paper.err }))

export const PaperHint = txt
  .config({ name: 'PaperHint' })
  .attrs({ tag: 'p' })
  .theme(() => ({ minHeight: 18, margin: 0, marginTop: 5, fontSize: 12.5, lineHeight: 1.5, color: paper.fog }))

export const PaperButton = el
  .config({ name: 'PaperButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme(() => ({
    height: 34,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    border: '1px solid',
    borderColor: paper.line,
    backgroundColor: paper.field,
    color: paper.text,
    fontFamily: font.system,
    fontSize: 13,
    extendCss: `&:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }`,
  }))
  .variants(() => ({
    secondary: {},
    primary: { height: 42, paddingLeft: 18, paddingRight: 18, border: 'none', backgroundColor: paper.accent, color: paper.accentText, fontWeight: 600, fontSize: 14 },
  }))

// `focusRing` is re-exported so demos can style their own focusable bits like the kit.
export { focusRing }
