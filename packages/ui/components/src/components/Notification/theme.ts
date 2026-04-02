import { defineComponentTheme } from '@pyreon/ui-theme'

export const notificationTheme = defineComponentTheme('Notification', (t, m) => ({
  base: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: t.spacing[4],
    borderRadius: t.radii.md,
    boxShadow: t.shadows.md,
    fontFamily: t.fontFamily.sans,
    fontSize: t.fontSize.sm,
    lineHeight: t.lineHeight.normal,
    backgroundColor: m('#ffffff', t.colors.gray[900]),
  },
  states: {
    info: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.info[500], t.colors.info[400]),
    },
    success: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.success[500], t.colors.success[400]),
    },
    warning: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.warning[500], t.colors.warning[400]),
    },
    error: {
      borderLeftWidth: '4px',
      borderLeftStyle: 'solid',
      borderLeftColor: m(t.colors.error[500], t.colors.error[400]),
    },
  },
}))
