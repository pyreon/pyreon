import rocketstyle from '@pyreon/rocketstyle'
import { SwitchBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { switchTheme } from './theme'

const resolved = getComponentTheme(switchTheme)

const Switch = rocketstyle({ useBooleans: true })({ name: 'Switch', component: SwitchBase as any })
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Switch
