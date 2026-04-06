import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { timePickerTheme } from './theme'

const resolved = getComponentTheme(timePickerTheme)

const TimePicker = rocketstyle({ useBooleans: true })({ name: 'TimePicker', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default TimePicker
