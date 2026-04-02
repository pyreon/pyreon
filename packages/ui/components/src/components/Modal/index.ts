import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'

const Modal = rocketstyle({ useBooleans: true })({
  name: 'Modal',
  component: ModalBase as any,
})
  .theme({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 50,
  })
  .sizes({
    sm: { maxWidth: 400 },
    md: { maxWidth: 500 },
    lg: { maxWidth: 640 },
    xl: { maxWidth: 800 },
    full: { maxWidth: '100%' },
  })

export default Modal
