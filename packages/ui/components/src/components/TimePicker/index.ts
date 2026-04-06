import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { timePickerTheme } from './theme'

const TimePicker = createComponent('TimePicker', Element, timePickerTheme, { tag: 'div' })
export default TimePicker
