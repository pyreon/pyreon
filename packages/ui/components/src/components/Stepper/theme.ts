import { defineComponentTheme } from '@pyreon/ui-theme'

export const stepperTheme = defineComponentTheme('Stepper', (t) => ({
  base: {
    display: 'flex',
    gap: t.spacing[2],
  },
  variants: {
    horizontal: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    vertical: {
      flexDirection: 'column',
    },
  },
}))

export const stepTheme = defineComponentTheme('Step', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: t.spacing[2],
    fontSize: t.fontSize.sm,
    color: m(t.colors.gray[500], t.colors.gray[400]),
    transition: t.transition.fast,
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
      borderRadius: t.radii.sm,
    },
  },
  states: {
    active: {
      backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
      color: '#fff',
      borderRadius: t.radii.full,
    },
    completed: {
      backgroundColor: m(t.colors.success[500], t.colors.success[600]),
      color: '#fff',
      borderRadius: t.radii.full,
    },
    default: {
      backgroundColor: m(t.colors.gray[200], t.colors.gray[700]),
      color: m(t.colors.gray[600], t.colors.gray[400]),
      borderRadius: t.radii.full,
    },
  },
}))
