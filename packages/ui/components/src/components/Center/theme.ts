import { defineComponentTheme } from '@pyreon/ui-theme'

export const centerTheme = defineComponentTheme('Center', () => ({
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
}))
