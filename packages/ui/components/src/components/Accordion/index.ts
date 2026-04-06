import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { accordionContentTheme, accordionItemTheme, accordionTheme, accordionTriggerTheme } from './theme'

const Accordion = createComponent('Accordion', Element, accordionTheme, { tag: 'div' })
export default Accordion

export const AccordionItem = createComponent('AccordionItem', Element, accordionItemTheme, { tag: 'div' })
export const AccordionTrigger = createComponent('AccordionTrigger', Element, accordionTriggerTheme, { tag: 'button' })
export const AccordionContent = createComponent('AccordionContent', Element, accordionContentTheme, { tag: 'div' })
