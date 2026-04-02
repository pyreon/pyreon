import rocketstyle from '@pyreon/rocketstyle'
import { CheckboxBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { checkboxTheme } from './theme'

const resolved = getComponentTheme(checkboxTheme)

const Checkbox = rocketstyle({ useBooleans: true })({ name: 'Checkbox', component: CheckboxBase as any })
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Checkbox
