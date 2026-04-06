import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { accordionTheme, accordionItemTheme, accordionTriggerTheme, accordionContentTheme } from './theme'

const aResolved = getComponentTheme(accordionTheme)

const Accordion = rocketstyle({ useBooleans: true })({ name: 'Accordion', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(aResolved.base)

export default Accordion

const aiResolved = getComponentTheme(accordionItemTheme)

export const AccordionItem = rocketstyle({ useBooleans: true })({
  name: 'AccordionItem',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme(aiResolved.base)

const atResolved = getComponentTheme(accordionTriggerTheme)

export const AccordionTrigger = rocketstyle({ useBooleans: true })({
  name: 'AccordionTrigger',
  component: Element,
})
  .attrs({ tag: 'button' })
  .theme(atResolved.base)

const acResolved = getComponentTheme(accordionContentTheme)

export const AccordionContent = rocketstyle({ useBooleans: true })({
  name: 'AccordionContent',
  component: Element,
})
  .attrs({ tag: 'div' })
  .theme(acResolved.base)
