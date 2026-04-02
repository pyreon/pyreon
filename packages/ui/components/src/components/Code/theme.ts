import { defineComponentTheme } from '@pyreon/ui-theme'

export const codeTheme = defineComponentTheme('Code', (t, m) => ({
  base: {
    fontFamily: t.fontFamily.mono,
    fontSize: t.fontSize.sm,
    backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    color: m(t.colors.gray[800], t.colors.gray[200]),
  },
  variants: {
    inline: {
      display: 'inline',
      padding: `${t.spacing[0]} ${t.spacing[1]}`,
      borderRadius: t.radii.sm,
    },
    block: {
      display: 'block',
      padding: t.spacing[4],
      borderRadius: t.radii.md,
      overflowX: 'auto',
      lineHeight: t.lineHeight.relaxed,
    },
  },
}))
