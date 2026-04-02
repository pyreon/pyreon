import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { dialogTheme } from './theme'

const resolved = getComponentTheme(dialogTheme)

const Dialog = rocketstyle({ useBooleans: true })({
  name: 'Dialog',
  component: ModalBase as any,
})
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Dialog
