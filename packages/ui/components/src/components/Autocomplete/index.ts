import rocketstyle from '@pyreon/rocketstyle'
import { ComboboxBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { autocompleteTheme } from './theme'

const resolved = getComponentTheme(autocompleteTheme)

const Autocomplete = rocketstyle({ useBooleans: true })({ name: 'Autocomplete', component: ComboboxBase as any })
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default Autocomplete
