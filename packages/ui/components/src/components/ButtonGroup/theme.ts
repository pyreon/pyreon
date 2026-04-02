import { defineComponentTheme } from '@pyreon/ui-theme'

export const buttonGroupTheme = defineComponentTheme('ButtonGroup', (t) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  variants: {
    attached: {
      gap: 0,
    },
    separated: {
      gap: t.spacing[2],
    },
  },
}))
