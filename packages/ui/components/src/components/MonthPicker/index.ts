import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { monthPickerTheme } from './theme'

const MonthPicker = createComponent('MonthPicker', Element, monthPickerTheme, { tag: 'div' })
export default MonthPicker
