import { defineComponentTheme } from '@pyreon/ui-theme'

export const sliderTheme = defineComponentTheme('Slider', (t, m) => ({
  base: {
    width: '100%',
    backgroundColor: m(t.colors.gray[200], t.colors.gray[700]),
    borderRadius: t.radii.full,
    position: 'relative',
    cursor: 'pointer',
    transition: t.transition.fast,
    focus: {
      boxShadow: `0 0 0 3px ${m(t.colors.primary[200], t.colors.primary[800])}`,
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  },
  sizes: {
    sm: {
      height: '4px',
    },
    md: {
      height: '6px',
    },
    lg: {
      height: '8px',
    },
  },
}))
