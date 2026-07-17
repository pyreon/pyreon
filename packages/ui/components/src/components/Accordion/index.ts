import {
  AccordionBase,
  AccordionContentBase,
  AccordionItemBase,
  AccordionTriggerBase,
} from '@pyreon/ui-primitives'
import { disabledState, el, focusRing } from '../../factory'

/**
 * Accordion — a WAI-ARIA disclosure set that delegates ALL behavior + a11y to
 * `AccordionBase` and adds only styling (the primitive-first rule).
 *
 * It was previously inert: the container/item were styled `<div>`s and the
 * trigger a bare `<button>` with NO `aria-expanded`, NO `aria-controls`, no
 * controlled state and no keyboard — so every consumer hand-rolled the whole
 * disclosure themselves (the showcase demo carried its own `signal`, its own
 * toggle and its own conditional render, with zero ARIA).
 *
 * Now it's declarative — the primitive owns the state:
 *
 * ```tsx
 * <Accordion defaultValue="a">           // or `multiple` + string[]
 *   <AccordionItem value="a">
 *     <AccordionTrigger>Question</AccordionTrigger>
 *     <AccordionContent>Answer</AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 *
 * Free from the primitive: `aria-expanded`, `aria-controls` ⇄ `aria-labelledby`
 * id linkage, `role="region"` panels, single/multiple expansion, ArrowUp/Down +
 * Home/End between triggers, and `type="button"` (so a trigger inside a form
 * can't submit it).
 *
 * NOTE: no `.attrs()` — with `component: XBase`, Element is no longer the
 * rendered component, so Element layout props (tag/direction/alignX/alignY)
 * would forward through `rest` onto the primitive's element as junk DOM
 * attributes. Layout is CSS here. (Same reason Combobox/Calendar/Tree carry
 * none.)
 */
const Accordion = el.config({ name: 'Accordion', component: AccordionBase }).theme(() => ({
  width: '100%',
}))

export default Accordion

export const AccordionItem = el
  .config({ name: 'AccordionItem', component: AccordionItemBase })
  .theme((t) => ({
    borderWidthBottom: 1,
    borderStyleBottom: 'solid',
    borderColorBottom: t.color.system.base[200],
  }))

export const AccordionTrigger = el
  .config({ name: 'AccordionTrigger', component: AccordionTriggerBase })
  .theme((t) => ({
    // Was `.attrs({ direction:'inline', alignX:'spaceBetween', alignY:'center' })`.
    // AccordionTriggerBase owns the <button> now, so the layout is CSS —
    // Element layout props would otherwise ride `rest` onto the DOM as junk.
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingTop: t.spacing.xSmall,
    paddingBottom: t.spacing.xSmall,
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.medium,
    color: t.color.system.dark[800],
    cursor: 'pointer',
    transition: t.transition.fast,
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlign: 'left',
    hover: {
      backgroundColor: t.color.system.base[50],
    },
    focus: { ...focusRing(t), borderRadius: t.borderRadius.small },
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))

export const AccordionContent = el
  .config({ name: 'AccordionContent', component: AccordionContentBase })
  .theme((t) => ({
    paddingBottom: t.spacing.xSmall,
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
  }))
