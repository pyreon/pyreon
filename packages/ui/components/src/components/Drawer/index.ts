import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'

const Drawer = rocketstyle({ useBooleans: true })({
  name: 'Drawer',
  component: ModalBase as any,
})
  .theme({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 50,
  })
  .variants({
    left: {
      justifyContent: 'flex-start',
    },
    right: {
      justifyContent: 'flex-end',
    },
    top: {
      alignItems: 'flex-start',
    },
    bottom: {
      alignItems: 'flex-end',
    },
  })
  .sizes({
    sm: { maxWidth: 280 },
    md: { maxWidth: 360 },
    lg: { maxWidth: 480 },
    xl: { maxWidth: 640 },
  })

export default Drawer
