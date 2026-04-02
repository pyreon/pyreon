import { defineComponentTheme } from '@pyreon/ui-theme'

export const dialogTheme = defineComponentTheme('Dialog', (t, m) => ({
  base: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: t.spacing[4],
  },
  sizes: {
    sm: { maxWidth: '360px' },
    md: { maxWidth: '420px' },
  },
}))

export const dialogContentTheme = defineComponentTheme('DialogContent', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    borderRadius: t.radii.xl,
    boxShadow: t.shadows.xl,
    width: '100%',
    padding: t.spacing[6],
  },
}))
