import { For } from '@pyreon/core'
import { font, motion, radius, text } from '../theme'
import { el, focusRing, tone, type ButtonAttrs } from './bases'

/**
 * `ToggleChips` — one choice out of several, as a row of pill buttons with
 * `aria-pressed` (the canvas's `.bb-ops`). Two jobs, one component:
 *
 *   - a SWITCHER (`kind="switch"`): which operation / engine a chart shows;
 *   - FILTER CHIPS (`kind="filter"`): which cards are listed, each with an
 *     optional count.
 *
 * Every option is a real `<button>`: Tab reaches it, Enter/Space presses it;
 * Left/Right (and Home/End) also move along the group and press, the way a
 * segmented control behaves. The group is a labelled `<fieldset>`.
 */
const Row = el
  .config({ name: 'ToggleChips' })
  .attrs({ tag: 'fieldset', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', minWidth: 0, margin: 0, padding: 0, border: 'none' }))

const Chip = el
  .config({ name: 'ToggleChip' })
  .attrs<ButtonAttrs>({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((_t, m) => ({
    minHeight: 34,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.3,
    textAlign: 'left',
    transition: `color ${motion.hover}, border-color ${motion.hover}, background-color ${motion.hover}`,
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
    pressed: { color: tone(m, 'text'), borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill') },
  }))

const Count = el
  .config({ name: 'ToggleChipCount' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ color: tone(m, 'fog') }))

export interface ToggleOption<T extends string> {
  value: T
  label: string
  count?: number | undefined
}

export function ToggleChips<T extends string>(props: {
  options: readonly ToggleOption<T>[]
  value: () => T
  onChange: (v: T) => void
  /** Accessible name of the group ("Operation", "Filter products"). */
  label: string
  kind?: 'switch' | 'filter' | undefined
}) {
  const move = (e: KeyboardEvent, i: number) => {
    const n = props.options.length
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    const opt = props.options[next]
    if (!opt) return
    props.onChange(opt.value)
    const group = (e.currentTarget as HTMLElement).parentElement
    ;(group?.children[next] as HTMLElement | undefined)?.focus()
  }
  return (
    <Row aria-label={props.label} data-kind={props.kind ?? 'switch'}>
      <For each={props.options.map((o, i) => ({ o, i }))} by={(x) => x.o.value}>
        {(x) => (
          <Chip
            type="button"
            aria-pressed={() => (props.value() === x.o.value ? 'true' : 'false')}
            onClick={() => props.onChange(x.o.value)}
            onKeyDown={(e: KeyboardEvent) => move(e, x.i)}
          >
            <span>{x.o.label}</span>
            {x.o.count !== undefined ? <Count>{String(x.o.count)}</Count> : null}
          </Chip>
        )}
      </For>
    </Row>
  )
}
