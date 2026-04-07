import rocketstyle from '@pyreon/rocketstyle'
import { ColorPickerBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const ColorPicker = rs({ name: 'ColorPicker', component: ColorPickerBase })
  .theme((t: any) => ({
    backgroundColor: t.color.system.light.base,
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.xSmall,
    boxShadow: t.shadows.base,
  }))

export default ColorPicker
