import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { datePickerTheme } from './theme'

const resolved = getComponentTheme(datePickerTheme)

const DatePicker = rocketstyle({ useBooleans: true })({ name: 'DatePicker', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default DatePicker
