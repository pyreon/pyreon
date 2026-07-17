import { SpoilerBase } from '@pyreon/ui-primitives'
import { el } from '../../factory'

/**
 * Spoiler — truncate-with-"show more" that delegates ALL behavior + a11y to
 * `SpoilerBase` and adds only styling (the primitive-first rule).
 *
 * It was previously a styled `<div>` with `overflow: hidden` and NOTHING else:
 * no state, no toggle, no measurement — so it clipped its content to whatever
 * height the consumer set and gave them no way to reveal the rest. Every
 * consumer hand-rolled the whole control.
 *
 * ```tsx
 * <Spoiler maxHeight={80}>
 *   {(s) => (
 *     <div {...s.rootProps()}>
 *       <div {...s.clipProps()}>
 *         <div {...s.contentProps()}>{longText}</div>
 *       </div>
 *       {() => s.needsToggle() && (
 *         <SpoilerToggle {...s.toggleProps()}>
 *           {() => (s.expanded() ? 'Hide' : 'Show more')}
 *         </SpoilerToggle>
 *       )}
 *     </div>
 *   )}
 * </Spoiler>
 * ```
 *
 * Free from the primitive: controlled/uncontrolled expansion, real measurement
 * (the toggle appears ONLY when the content actually overflows `maxHeight`),
 * `aria-expanded` ⇄ `aria-controls` linkage, `type="button"`, and a max-height
 * transition that respects `prefers-reduced-motion`.
 *
 * NOTE: no `overflow: hidden` here any more, and no `transition`. The
 * primitive's `clipProps` element owns both — clipping the ROOT would also clip
 * the toggle control, which sits outside the clipped region by design, and the
 * transition belongs on the element whose max-height actually animates.
 *
 * NOTE: no `.attrs()` — with `component: SpoilerBase`, Element is no longer the
 * rendered component, so Element layout props (tag) would forward through
 * `rest` onto the root as junk DOM attributes. (Same reason
 * Accordion/Combobox/Calendar/Tree/PinInput carry none.)
 */
const Spoiler = el.config({ name: 'Spoiler', component: SpoilerBase }).theme(() => ({
  position: 'relative',
}))

export default Spoiler

/**
 * The reveal control. Spread `state.toggleProps()` onto it — that carries
 * `type="button"`, the click handler, and the live `aria-expanded`/
 * `aria-controls` linkage.
 *
 * Stays an Element-rendered `<button>`: it owns no behaviour of its own, so
 * there is no primitive to delegate to — `SpoilerBase` drives it.
 */
export const SpoilerToggle = el
  .config({ name: 'SpoilerToggle' })
  .attrs({ tag: 'button' })
  .theme((t) => ({
    marginTop: t.spacing.xxSmall,
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: t.color.system.primary.base,
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    cursor: 'pointer',
    hover: { textDecoration: 'underline' },
  }))
