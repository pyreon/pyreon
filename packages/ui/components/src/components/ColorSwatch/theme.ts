import { defineComponentTheme } from '@pyreon/ui-theme'

export const colorSwatchTheme = defineComponentTheme('ColorSwatch', (t, m) => ({
  base: {
    width: '32px',
    height: '32px',
    borderRadius: t.radii.full,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[200], t.colors.gray[700]),
    display: 'inline-block',
  },
  sizes: {
    sm: {
      width: '24px',
      height: '24px',
    },
    md: {
      width: '32px',
      height: '32px',
    },
    lg: {
      width: '40px',
      height: '40px',
    },
  },
}))
