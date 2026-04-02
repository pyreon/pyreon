import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { modalTheme } from './theme'

const resolved = getComponentTheme(modalTheme)

const Modal = rocketstyle({ useBooleans: true })({
  name: 'Modal',
  component: ModalBase as any,
})
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Modal
