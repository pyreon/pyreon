import { defineComponentTheme } from '@pyreon/ui-theme'

export const checkboxTheme = defineComponentTheme('Checkbox', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.spacing[2],
    cursor: 'pointer',
    color: m(t.colors.gray[700], t.colors.gray[300]),
    fontSize: t.fontSize.sm,
    transition: t.transition.fast,
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
  sizes: {
    sm: {
      fontSize: t.fontSize.xs,
      gap: t.spacing[1.5],
    },
    md: {
      fontSize: t.fontSize.sm,
      gap: t.spacing[2],
    },
    lg: {
      fontSize: t.fontSize.md,
      gap: t.spacing[2.5],
    },
  },
}))
