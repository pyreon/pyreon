import rocketstyle from '@pyreon/rocketstyle'
import { ColorPickerBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { colorPickerTheme } from './theme'

const resolved = getComponentTheme(colorPickerTheme)

const ColorPicker = rocketstyle({ useBooleans: true })({ name: 'ColorPicker', component: ColorPickerBase as any })
  .theme(resolved.base)

export default ColorPicker
