import { el } from '../../factory'
import { ColorPickerBase } from '@pyreon/ui-primitives'

const ColorPicker = el.config({ name: 'ColorPicker', component: ColorPickerBase }).theme((t) => ({
  backgroundColor: t.color.system.light.base,
  borderRadius: t.borderRadius.medium,
  padding: t.spacing.xSmall,
  boxShadow: t.shadows.base,
}))

export default ColorPicker
