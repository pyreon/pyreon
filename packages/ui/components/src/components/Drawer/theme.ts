import { defineComponentTheme } from '@pyreon/ui-theme'

export const drawerTheme = defineComponentTheme('Drawer', (t, m) => ({
  base: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 50,
  },
  variants: {
    left: {
      display: 'flex',
      justifyContent: 'flex-start',
    },
    right: {
      display: 'flex',
      justifyContent: 'flex-end',
    },
    top: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
    },
    bottom: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
    },
  },
  sizes: {
    sm: { width: '280px' },
    md: { width: '360px' },
    lg: { width: '480px' },
    xl: { width: '640px' },
  },
}))

export const drawerPanelTheme = defineComponentTheme('DrawerPanel', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    boxShadow: t.shadows.xl,
    height: '100%',
    overflow: 'auto',
    padding: t.spacing[6],
  },
}))
