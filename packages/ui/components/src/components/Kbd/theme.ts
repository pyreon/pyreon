import { defineComponentTheme } from '@pyreon/ui-theme'

export const kbdTheme = defineComponentTheme('Kbd', (t, m) => ({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: t.fontFamily.mono,
    fontSize: t.fontSize.sm,
    fontWeight: t.fontWeight.medium,
    lineHeight: t.lineHeight.tight,
    backgroundColor: m(t.colors.gray[100], t.colors.gray[800]),
    color: m(t.colors.gray[800], t.colors.gray[200]),
    borderRadius: t.radii.sm,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: m(t.colors.gray[300], t.colors.gray[600]),
    borderBottomWidth: '2px',
    paddingLeft: t.spacing[2],
    paddingRight: t.spacing[2],
    paddingTop: t.spacing[0],
    paddingBottom: t.spacing[0],
    whiteSpace: 'nowrap',
  },
}))
