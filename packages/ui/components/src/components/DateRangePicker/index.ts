import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { dateRangePickerTheme } from './theme'

const DateRangePicker = createComponent('DateRangePicker', Element, dateRangePickerTheme, { tag: 'div' })
export default DateRangePicker
