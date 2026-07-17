import { PinInputBase } from '@pyreon/ui-primitives'
import { disabledState, el, focusRingTone } from '../../factory'

/**
 * PinInput — a segmented one-time-code / PIN entry that delegates ALL behavior
 * + a11y to `PinInputBase` and adds only styling (the primitive-first rule).
 *
 * It was previously a styled `<div>` with NOTHING in it: an empty `.theme()`,
 * a `gap` from `.attrs()`, and no cells, no state, no keyboard, no paste — so
 * a consumer got a flex row and hand-rolled the entire control themselves.
 *
 * Now it's declarative — the primitive owns the state:
 *
 * ```tsx
 * <PinInput length={6} type="number" onComplete={submit}>
 *   {(s) => (
 *     <div {...s.rootProps()} aria-label="One-time code">
 *       <PinInputCell {...s.getCellProps(0)} />
 *       <PinInputCell {...s.getCellProps(1)} />
 *       …
 *     </div>
 *   )}
 * </PinInput>
 * ```
 *
 * Free from the primitive: auto-advance on entry, Backspace→previous cell,
 * ArrowLeft/Right, Home/End, **paste-distribute** (pasting `123456` into any
 * cell fills the rest — the signature OTP behaviour), `onComplete` fired once
 * per completion, per-cell `aria-label` ("Digit 3 of 6"), and
 * `autocomplete="one-time-code"` on the FIRST cell only (so the platform SMS
 * autofill targets one field rather than racing six).
 *
 * RENDER THE CELLS STATICALLY — do NOT wrap them in a reactive accessor
 * (`{() => s.cells().map(…)}`). That subscribes the accessor to the cell state,
 * so every keystroke REMOUNTS the inputs and destroys the caret mid-typing
 * (measured: identity lost, activeElement → body). `getCellProps` returns
 * ACCESSOR-valued props, so each cell stays live WITHOUT the list re-rendering.
 * This is the opposite of Tree/Combobox, whose `getItemProps` are snapshots.
 *
 * NOTE: no `.attrs()` — with `component: PinInputBase`, Element is no longer
 * the rendered component, so Element layout props (tag/direction/gap) would
 * forward through `rest` onto the group as junk DOM attributes. The row is CSS
 * here. (Same reason Accordion/Combobox/Calendar/Tree carry none.)
 */
const PinInput = el
  .config({ name: 'PinInput', component: PinInputBase })
  .theme(() => ({
    // Was `.attrs({ tag: 'div', direction: 'inline', gap: 2 })` — PinInputBase
    // owns the group element now, so the row is CSS or it rides `rest` onto
    // the DOM as junk. The `.theme()` was otherwise EMPTY: the whole rocketstyle
    // chain computed a class that described nothing.
    display: 'inline-flex',
    alignItems: 'center',
  }))
  .sizes((t) => ({
    small: { gap: t.spacing.xxSmall },
    medium: { gap: t.spacing.xxSmall },
    large: { gap: t.spacing.xSmall },
  }))

export default PinInput

/**
 * A single PIN cell. Spread `state.getCellProps(i)` onto it — that carries the
 * value, the handlers, `maxLength`, `inputMode`, the per-cell `aria-label` and
 * (on cell 0 only) `autocomplete="one-time-code"`.
 *
 * Stays an Element-rendered `<input>`: it owns no behaviour of its own, so
 * there is no primitive to delegate to — the parent `PinInputBase` drives it.
 */
export const PinInputCell = el
  .config({ name: 'PinInputCell' })
  .attrs({ tag: 'input' })
  .theme((t) => ({
    width: '40px',
    height: '40px',
    textAlign: 'center',
    fontSize: t.fontSize.medium,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[300],
    borderRadius: t.borderRadius.base,
    backgroundColor: t.color.system.light.base,
    color: t.color.system.dark[800],
    outline: 'none',
    transition: t.transition.fast,
    focus: { ...focusRingTone(t, 'primary'), borderColor: t.color.system.primary.base },
    disabled: { ...disabledState(), backgroundColor: t.color.system.base[50] },
  }))
  .sizes((t) => ({
    small: { width: '36px', height: '36px', fontSize: t.fontSize.base },
    medium: { width: '40px', height: '40px', fontSize: t.fontSize.medium },
    large: { width: '48px', height: '48px', fontSize: t.fontSize.large },
  }))
