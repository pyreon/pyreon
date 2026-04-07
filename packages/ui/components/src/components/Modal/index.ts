import { rs } from '../../factory'
import { ModalBase } from '@pyreon/ui-primitives'


const Modal = rs({ name: 'Modal', component: ModalBase })
  .theme((t) => ({
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
    padding: t.spacing.small,
  }))
  .sizes(() => ({
    small: { maxWidth: '400px' },
    medium: { maxWidth: '500px' },
    large: { maxWidth: '640px' },
    xLarge: { maxWidth: '800px' },
    full: { maxWidth: '100%' },
  }))

export default Modal
