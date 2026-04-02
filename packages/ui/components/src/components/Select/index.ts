import rocketstyle from '@pyreon/rocketstyle'
import { SelectBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { selectTheme } from './theme'

const resolved = getComponentTheme(selectTheme)

const Select = rocketstyle({ useBooleans: true })({ name: 'Select', component: SelectBase as any })
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default Select
