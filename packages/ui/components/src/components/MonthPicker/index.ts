import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { monthPickerTheme } from './theme'

const resolved = getComponentTheme(monthPickerTheme)

const MonthPicker = rocketstyle({ useBooleans: true })({ name: 'MonthPicker', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default MonthPicker
