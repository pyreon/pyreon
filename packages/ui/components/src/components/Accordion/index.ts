import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Accordion = rocketstyle({ useBooleans: true })({ name: 'Accordion', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme({
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  })

export default Accordion

export const AccordionItem = rocketstyle({ useBooleans: true })({
  name: 'AccordionItem',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme({
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#e5e7eb',
  })

export const AccordionTrigger = rocketstyle({ useBooleans: true })({
  name: 'AccordionTrigger',
  component: Element,
})
  .attrs({ tag: 'button' } as any)
  .theme({
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 0,
    fontSize: 14,
    hover: { backgroundColor: '#f9fafb' },
  })

export const AccordionContent = rocketstyle({ useBooleans: true })({
  name: 'AccordionContent',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme({
    paddingTop: 0,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
  })
