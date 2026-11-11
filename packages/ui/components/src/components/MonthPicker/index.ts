import { el, tones } from '../../factory'

const MonthPicker = el
  .config({ name: 'MonthPicker' })
  .attrs({ tag: 'div' })
  .theme((t, m) => ({
    backgroundColor: tones(t, m).surface,
    color: tones(t, m).text,
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: tones(t, m).border,
    borderRadius: t.borderRadius.medium,
    padding: t.spacing.xSmall,
  }))

export default MonthPicker
