import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { dateTimePickerTheme } from './theme'

const resolved = getComponentTheme(dateTimePickerTheme)

const DateTimePicker = rocketstyle({ useBooleans: true })({ name: 'DateTimePicker', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default DateTimePicker
