import { defineComponentTheme } from '@pyreon/ui-theme'

export const paragraphTheme = defineComponentTheme('Paragraph', (t, m) => ({
  base: {
    color: m(t.colors.gray[700], t.colors.gray[300]),
    fontFamily: t.fontFamily.sans,
    lineHeight: t.lineHeight.normal,
    margin: 0,
  },
  sizes: {
    sm: { fontSize: t.fontSize.sm },
    md: { fontSize: t.fontSize.md },
    lg: { fontSize: t.fontSize.lg },
  },
}))
