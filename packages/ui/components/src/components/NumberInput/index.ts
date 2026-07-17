import { NumberInputBase } from '@pyreon/ui-primitives'
import { disabledState, el, focusRingTone } from '../../factory'

/**
 * NumberInput — a WAI-ARIA spinbutton that delegates ALL behavior + a11y to
 * `NumberInputBase` and adds only styling (the primitive-first rule).
 *
 * It was previously a lie: `.attrs({ tag: 'input' })` omitted `type: 'number'`,
 * so `min`/`max`/`step` — which it went to the trouble of DECLARING — reached a
 * TEXT input, where the browser silently ignores them. No stepping, no
 * clamping, no keyboard, no ARIA. Typing "abc" was accepted.
 *
 * The primitive renders a text input with `role="spinbutton"` +
 * `inputmode="decimal"` rather than `<input type="number">` — native number
 * inputs have unstylable spinners (this library styles everything through
 * rocketstyle), mutate silently on wheel-scroll, format inconsistently across
 * browsers, and give no control over `aria-valuetext`. That's the same call
 * Mantine/Ark/Radix make.
 *
 * Free from the primitive: ArrowUp/Down (±step, snapped to the step grid),
 * PageUp/Down (±largeStep), Home/End (min/max, when finite), clamping,
 * step/precision with float-drift protection (0.2 + 0.1 → exactly 0.3), and
 * `aria-valuenow`/`valuemin`/`valuemax`.
 *
 * ```tsx
 * <NumberInput min={0} max={10} step={0.5} value={qty()} onChange={qty.set} />
 * ```
 *
 * For +/- spinner buttons, drive them from the primitive's render-fn state —
 * `state.increment` / `state.decrement`, disabled on `!state.canIncrement()` /
 * `!state.canDecrement()`.
 *
 * NOTE: no `.attrs()` — with `component: NumberInputBase`, Element is no longer
 * the rendered component, so Element layout props (tag/block) would forward
 * through `rest` onto the input as junk DOM attributes. Layout is CSS here.
 */
const NumberInput = el
  .config({ name: 'NumberInput', component: NumberInputBase })
  .theme((t) => ({
    display: 'block',
    width: '100%',
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    fontSize: t.fontSize.small,
    lineHeight: t.lineHeight.base,
    transition: t.transition.fast,
    outline: 'none',
    focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
    disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
    placeholder: {
      color: t.color.system.base[400],
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.small,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
      borderRadius: t.borderRadius.base,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xSmall,
      paddingBottom: t.spacing.xSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
      borderRadius: t.borderRadius.medium,
    },
  }))

export default NumberInput
