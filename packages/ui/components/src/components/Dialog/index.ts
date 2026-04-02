import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'

const Dialog = rocketstyle({ useBooleans: true })({
  name: 'Dialog',
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
    sm: { maxWidth: 360 },
    md: { maxWidth: 420 },
  })

export default Dialog
