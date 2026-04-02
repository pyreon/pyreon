import {
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  radii,
  shadows,
  spacing,
  transition,
} from '@pyreon/ui-tokens'
import { buildSemantics } from './semantics'
import type { ThemeConfig } from './types'

/** Default Pyreon UI theme built from tokens. */
export const defaultTheme: ThemeConfig = {
  colors: {
    primary: colors.primary,
    secondary: colors.secondary,
    error: colors.error,
    warning: colors.warning,
    success: colors.success,
    info: colors.info,
    gray: colors.gray,
    slate: colors.slate,
    blue: colors.blue,
    red: colors.red,
    orange: colors.orange,
    amber: colors.amber,
    green: colors.green,
    teal: colors.teal,
    cyan: colors.cyan,
    violet: colors.violet,
    pink: colors.pink,
    rose: colors.rose,
  },
  semantic: buildSemantics(colors.gray, colors.primary),
  fontFamily,
  fontSize: { ...fontSize },
  fontWeight: { ...fontWeight },
  lineHeight: { ...lineHeight },
  spacing: { ...spacing },
  radii: { ...radii },
  shadows: { ...shadows },
  transition: { ...transition },
}
