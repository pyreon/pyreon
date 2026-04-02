import { defineComponentTheme } from '@pyreon/ui-theme'

export const imageTheme = defineComponentTheme('Image', (t) => ({
  base: {
    borderRadius: t.radii.md,
    maxWidth: '100%',
    display: 'block',
  },
  variants: {
    rounded: { borderRadius: t.radii.md },
    circle: { borderRadius: t.radii.full },
  },
}))
