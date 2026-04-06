import { ColorPickerBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { colorPickerTheme } from './theme'

const ColorPicker = createComponent('ColorPicker', ColorPickerBase, colorPickerTheme)
export default ColorPicker
