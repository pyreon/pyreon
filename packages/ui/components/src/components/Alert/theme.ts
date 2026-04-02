import { defineComponentTheme } from '@pyreon/ui-theme'

export const alertTheme = defineComponentTheme('Alert', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: t.spacing[4],
    borderRadius: t.radii.md,
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.sm,
    lineHeight: t.lineHeight.normal,
  },
  states: {
    info: {
      backgroundColor: m(t.colors.info[50], t.colors.info[950]),
      color: m(t.colors.info[800], t.colors.info[200]),
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.info[500], t.colors.info[400]),
    },
    success: {
      backgroundColor: m(t.colors.success[50], t.colors.success[950]),
      color: m(t.colors.success[800], t.colors.success[200]),
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.success[500], t.colors.success[400]),
    },
    warning: {
      backgroundColor: m(t.colors.warning[50], t.colors.warning[950]),
      color: m(t.colors.warning[800], t.colors.warning[200]),
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.warning[500], t.colors.warning[400]),
    },
    error: {
      backgroundColor: m(t.colors.error[50], t.colors.error[950]),
      color: m(t.colors.error[800], t.colors.error[200]),
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.error[500], t.colors.error[400]),
    },
  },
  variants: {
    subtle: {},
    solid: {
      borderLeftWidth: '0',
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'currentColor',
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
    },
  },
}))
