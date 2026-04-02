import { ModalBase } from '@pyreon/ui-primitives'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { drawerTheme } from './theme'

const resolved = getComponentTheme(drawerTheme)

const Drawer = rocketstyle({ useBooleans: true })({
  name: 'Drawer',
  component: ModalBase as any,
})
  .theme(resolved.base)
  .variants(resolved.variants)
  .sizes(resolved.sizes)

export default Drawer
