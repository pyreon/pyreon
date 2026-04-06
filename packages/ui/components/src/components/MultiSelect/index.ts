import rocketstyle from '@pyreon/rocketstyle'
import { ComboboxBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { multiSelectTheme } from './theme'

const resolved = getComponentTheme(multiSelectTheme)

const MultiSelect = rocketstyle({ useBooleans: true })({ name: 'MultiSelect', component: ComboboxBase as any })
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default MultiSelect
