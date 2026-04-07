import { rs } from '../../factory'
import { ModalBase } from '@pyreon/ui-primitives'

const Dialog = rs({ name: 'Dialog', component: ModalBase })
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
    small: { maxWidth: '360px' },
    medium: { maxWidth: '420px' },
  }))

export default Dialog
