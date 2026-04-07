import { el } from '../../factory'

const MonthPicker = el
  .config({ name: 'MonthPicker' })
  .attrs({ tag: 'div' })
  .theme((t: any) => ({
    backgroundColor: t.color.system.light.base,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: t.color.system.base[200],
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.xSmall,
  }))

export default MonthPicker
