import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { datePickerTheme } from './theme'

const DatePicker = createComponent('DatePicker', Element, datePickerTheme, { tag: 'div' })
export default DatePicker
