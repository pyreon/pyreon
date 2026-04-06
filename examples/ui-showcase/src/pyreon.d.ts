import type { styles } from '@pyreon/unistyle'

type Theme = Parameters<typeof styles>[0]['theme']
type ThemeWithPseudo = Theme & { hover?: Theme; focus?: Theme; active?: Theme }

declare module '@pyreon/rocketstyle' {
  interface StylesDefault extends ThemeWithPseudo {}
}
