import { el } from '../../factory'

const Accordion = el
  .config({ name: 'Accordion' })
  .attrs({ tag: 'div' })
  .theme(() => ({
    width: '100%',
  }))

export default Accordion

export const AccordionItem = el
  .config({ name: 'AccordionItem' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: t.color.system.base[200],
  }))

export const AccordionTrigger = el
  .config({ name: 'AccordionTrigger' })
  .attrs({ tag: 'button' })
  .theme((t) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    hover: { backgroundColor: t.color.system.base[50] },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))

export const AccordionContent = el
  .config({ name: 'AccordionContent' })
  .attrs({ tag: 'div' })
  .theme((t) => ({
    paddingBottom: t.spacing.xSmall,
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
  }))
