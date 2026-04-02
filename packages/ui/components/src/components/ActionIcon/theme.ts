import { defineComponentTheme } from '@pyreon/ui-theme'

export const actionIconTheme = defineComponentTheme('ActionIcon', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: t.radii.md,
    transition: t.transition.fast,
    hover: {
      transform: 'scale(1.05)',
    },
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
    },
    active: {
      transform: 'scale(0.95)',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  states: {
    primary: {
      backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
      color: '#fff',
      hover: { backgroundColor: m(t.colors.primary[600], t.colors.primary[500]) },
    },
    secondary: {
      backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
      color: m(t.colors.gray[700], t.colors.gray[200]),
      hover: { backgroundColor: m(t.colors.gray[200], t.colors.gray[700]) },
    },
    danger: {
      backgroundColor: m(t.colors.error[500], t.colors.error[600]),
      color: '#fff',
      hover: { backgroundColor: m(t.colors.error[600], t.colors.error[500]) },
      focus: { boxShadow: `0 0 0 3px ${m(t.colors.error[200], t.colors.error[800])}` },
    },
  },
  sizes: {
    xs: { width: '24px', height: '24px', fontSize: t.fontSize.xs },
    sm: { width: '30px', height: '30px', fontSize: t.fontSize.sm },
    md: { width: '36px', height: '36px', fontSize: t.fontSize.md },
    lg: { width: '42px', height: '42px', fontSize: t.fontSize.lg },
    xl: { width: '48px', height: '48px', fontSize: t.fontSize.xl },
  },
  variants: {
    filled: {},
    outline: {
      backgroundColor: 'transparent',
      borderColor: m(t.colors.primary[500], t.colors.primary[400]),
      color: m(t.colors.primary[600], t.colors.primary[400]),
      hover: { backgroundColor: m(t.colors.primary[50], t.colors.primary[950]) },
    },
    subtle: {
      backgroundColor: m(t.colors.primary[50], t.colors.primary[950]),
      color: m(t.colors.primary[600], t.colors.primary[400]),
      hover: { backgroundColor: m(t.colors.primary[100], t.colors.primary[900]) },
    },
    transparent: {
      backgroundColor: 'transparent',
      color: m(t.colors.gray[500], t.colors.gray[400]),
      hover: { backgroundColor: m(t.colors.gray[100], t.colors.gray[800]), color: m(t.colors.gray[900], t.colors.gray[100]) },
    },
  },
}))
