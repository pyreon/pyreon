import rocketstyle from '@pyreon/rocketstyle'
import { ComboboxBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { comboboxTheme } from './theme'

const resolved = getComponentTheme(comboboxTheme)

const Combobox = rocketstyle({ useBooleans: true })({ name: 'Combobox', component: ComboboxBase as any })
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default Combobox
