import { defineComponentTheme } from '@pyreon/ui-theme'

export const accordionTheme = defineComponentTheme('Accordion', (t) => ({
  base: {
    width: '100%',
  },
}))

export const accordionItemTheme = defineComponentTheme('AccordionItem', (t, m) => ({
  base: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: m(t.colors.gray[200], t.colors.gray[800]),
  },
}))

export const accordionTriggerTheme = defineComponentTheme('AccordionTrigger', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: t.spacing[3],
    paddingBottom: t.spacing[3],
    fontSize: t.fontSize.sm,
    fontWeight: t.fontWeight.medium,
    color: m(t.colors.gray[900], t.colors.gray[100]),
    cursor: 'pointer',
    transition: t.transition.fast,
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlign: 'left',
    hover: {
      backgroundColor: m(t.colors.gray[50], t.colors.gray[800]),
    },
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
      borderRadius: t.radii.sm,
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
}))

export const accordionContentTheme = defineComponentTheme('AccordionContent', (t, m) => ({
  base: {
    paddingBottom: t.spacing[3],
    fontSize: t.fontSize.sm,
    color: m(t.colors.gray[700], t.colors.gray[300]),
  },
}))
