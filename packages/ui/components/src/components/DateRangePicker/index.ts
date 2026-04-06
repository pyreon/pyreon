import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { dateRangePickerTheme } from './theme'

const resolved = getComponentTheme(dateRangePickerTheme)

const DateRangePicker = rocketstyle({ useBooleans: true })({ name: 'DateRangePicker', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default DateRangePicker
