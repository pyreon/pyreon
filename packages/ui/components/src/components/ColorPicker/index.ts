import { el, tones } from '../../factory'
import { ColorPickerBase } from '@pyreon/ui-primitives'

const ColorPicker = el.config({ name: 'ColorPicker', component: ColorPickerBase }).theme((t, m) => ({
  backgroundColor: tones(t, m).surface,
  color: tones(t, m).text,
  // A panel on the page needs an edge in both modes (the shadow alone is
  // invisible on a dark page).
  borderWidth: t.borderWidth.base,
  borderStyle: t.borderStyle.base,
  borderColor: tones(t, m).border,
  borderRadius: t.borderRadius.medium,
  padding: t.spacing.xSmall,
  boxShadow: t.shadows.base,
}))

export default ColorPicker
