import { defineComponentTheme } from '@pyreon/ui-theme'

export const spoilerTheme = defineComponentTheme('Spoiler', (t) => ({
  base: {
    overflow: 'hidden',
    position: 'relative',
  },
}))
