import { defineComponentTheme } from '@pyreon/ui-theme'

export const titleTheme = defineComponentTheme('Title', (t, m) => ({
  base: {
    color: m(t.colors.gray[900], t.colors.gray[50]),
    fontWeight: t.fontWeight.bold,
    fontFamily: t.fontFamily.sans,
    lineHeight: t.lineHeight.tight,
    margin: 0,
  },
  sizes: {
    h1: { fontSize: t.fontSize['4xl'] },
    h2: { fontSize: t.fontSize['3xl'] },
    h3: { fontSize: t.fontSize['2xl'] },
    h4: { fontSize: t.fontSize.xl },
    h5: { fontSize: t.fontSize.lg },
    h6: { fontSize: t.fontSize.md },
  },
}))
