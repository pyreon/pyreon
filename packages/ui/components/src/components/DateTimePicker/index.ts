import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { dateTimePickerTheme } from './theme'

const DateTimePicker = createComponent('DateTimePicker', Element, dateTimePickerTheme, { tag: 'div' })
export default DateTimePicker
