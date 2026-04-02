import { defineComponentTheme } from '@pyreon/ui-theme'

export const modalTheme = defineComponentTheme('Modal', (t, m) => ({
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
    sm: { maxWidth: '400px' },
    md: { maxWidth: '500px' },
    lg: { maxWidth: '640px' },
    xl: { maxWidth: '800px' },
    full: { maxWidth: '100%' },
  },
}))

export const modalContentTheme = defineComponentTheme('ModalContent', (t, m) => ({
  base: {
    backgroundColor: m('#fff', t.colors.gray[900]),
    borderRadius: t.radii.xl,
    boxShadow: t.shadows.xl,
    width: '100%',
    maxHeight: '85vh',
    overflow: 'auto',
    padding: t.spacing[6],
  },
}))
