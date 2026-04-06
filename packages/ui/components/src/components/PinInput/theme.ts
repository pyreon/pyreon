import { defineComponentTheme } from '@pyreon/ui-theme'

export const pinInputTheme = defineComponentTheme('PinInput', (t, m) => ({
  base: {
    display: 'flex',
    gap: t.spacing[2],
  },
  sizes: {
    sm: {
      gap: t.spacing[1.5],
    },
    md: {
      gap: t.spacing[2],
    },
    lg: {
      gap: t.spacing[3],
    },
  },
}))

export const pinInputCellTheme = defineComponentTheme('PinInputCell', (t, m) => ({
  base: {
    width: '40px',
    height: '40px',
    textAlign: 'center',
    fontSize: t.fontSize.lg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[300], t.colors.gray[700]),
    borderRadius: t.radii.md,
    backgroundColor: m('#fff', t.colors.gray[900]),
    color: m(t.colors.gray[900], t.colors.gray[100]),
    outline: 'none',
    transition: t.transition.fast,
    focus: {
      borderColor: m(t.colors.primary[500], t.colors.primary[400]),
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
    },
  },
  sizes: {
    sm: {
      width: '36px',
      height: '36px',
      fontSize: t.fontSize.md,
    },
    md: {
      width: '40px',
      height: '40px',
      fontSize: t.fontSize.lg,
    },
    lg: {
      width: '48px',
      height: '48px',
      fontSize: t.fontSize.xl,
    },
  },
}))
