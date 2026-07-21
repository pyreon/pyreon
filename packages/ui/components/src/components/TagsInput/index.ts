import { el } from '../../factory'
import { TagsInputBase } from '@pyreon/ui-primitives'

/**
 * Free-form tag entry, delegated to `TagsInputBase` (Enter/comma commit,
 * Backspace-on-empty removes, paste splits, dedup/validate/maxTags,
 * localizable labels). NOTE: no `.attrs()` — the Tree/Combobox rule for
 * primitive-backed components; the theme lands on the element the consumer
 * spreads `rootProps()` onto.
 */
const TagsInput = el.config({ name: 'TagsInput', component: TagsInputBase }).theme((t) => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: t.spacing.xxSmall,
  padding: t.spacing.xxSmall,
  borderWidth: t.borderWidth.base,
  borderStyle: t.borderStyle.base,
  borderColor: t.color.system.base[300],
  borderRadius: t.borderRadius.base,
  backgroundColor: t.color.system.light.base,
}))

export default TagsInput
