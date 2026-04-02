import { defineComponentTheme } from '@pyreon/ui-theme'

export const switchTheme = defineComponentTheme('Switch', (t, m) => ({
  base: {
    backgroundColor: m(t.colors.gray[300], t.colors.gray[600]),
    borderRadius: t.radii.full,
    cursor: 'pointer',
    transition: t.transition.fast,
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    hover: {
      backgroundColor: m(t.colors.gray[400], t.colors.gray[500]),
    },
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
    },
    active: {
      backgroundColor: m(t.colors.primary[500], t.colors.primary[600]),
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  sizes: {
    sm: {
      width: '28px',
      height: '16px',
    },
    md: {
      width: '36px',
      height: '20px',
    },
    lg: {
      width: '44px',
      height: '24px',
    },
  },
}))
