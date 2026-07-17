import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'
import { el } from '../../factory'

/**
 * SegmentedControl — a single-select control, which IS the WAI-ARIA radiogroup
 * pattern. It now delegates behavior + a11y to `RadioGroupBase` / `RadioBase`
 * (the primitive-first rule) and adds only styling.
 *
 * Previously the container was a styled `<div>` and each item a plain
 * `<button>` with NO `role`, NO `aria-checked` and NO keyboard support —
 * assistive tech had no idea it was a single-select group, and arrow keys did
 * nothing. Reusing the radiogroup primitives (rather than inventing a
 * SegmentedControlBase) gets all of that for free:
 * `role="radiogroup"` / `role="radio"`, `aria-checked`, and arrow-key roving
 * focus via `navigateByRole`.
 *
 * ```tsx
 * <SegmentedControl value={view()} onChange={view.set}>
 *   <SegmentedControlItem value="list">List</SegmentedControlItem>
 *   <SegmentedControlItem value="grid">Grid</SegmentedControlItem>
 * </SegmentedControl>
 * ```
 *
 * NOTE: no `.attrs()` — with `component: RadioGroupBase`, Element is no longer
 * the rendered component, so Element layout props (tag/direction) would be
 * forwarded through `rest` onto the primitive's `<div role="radiogroup">` as
 * junk DOM attributes. The inline layout is CSS instead. (Same reason
 * Combobox/Calendar/Tree carry no `.attrs()`.)
 */
const SegmentedControl = el
  .config({ name: 'SegmentedControl', component: RadioGroupBase })
  .theme((t) => ({
    display: 'inline-flex',
    backgroundColor: t.color.system.base[100],
    borderRadius: t.borderRadius.base,
    padding: t.spacing.xxxSmall,
  }))
  .sizes((t) => ({
    small: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.small },
    medium: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.base },
    large: { padding: t.spacing.xxxSmall, borderRadius: t.borderRadius.medium },
  }))

export default SegmentedControl

/**
 * One segment. Delegates to `RadioBase`, which renders a real
 * `<button role="radio">` with `aria-checked`, roving `tabIndex` and
 * arrow-key navigation scoped to the enclosing `[role="radiogroup"]`.
 * Requires a `value`; selection state comes from the parent's context, so the
 * `active` state below is styling only. No `.attrs({ tag })` — RadioBase owns
 * the element.
 */
export const SegmentedControlItem = el
  .config({ name: 'SegmentedControlItem', component: RadioBase })
  .theme((t) => ({
    cursor: 'pointer',
    fontWeight: t.fontWeight.medium,
    fontSize: t.fontSize.small,
    transition: t.transition.fast,
    borderRadius: t.borderRadius.small,
    color: t.color.system.base[600],
    backgroundColor: 'transparent',
    borderWidth: 0,
    outline: 'none',
    hover: {
      color: t.color.system.dark[800],
    },
  }))
  .states((t) => ({
    active: {
      backgroundColor: t.color.system.light.base,
      color: t.color.system.dark[800],
      boxShadow: t.shadows.small,
    },
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
    },
  }))
