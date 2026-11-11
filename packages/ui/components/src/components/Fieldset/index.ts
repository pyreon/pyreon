import { el, tones, txt } from '../../factory'

/**
 * Semantic form grouping — a real `<fieldset>` with a themed border. Pair
 * with `<FieldsetLegend>` (a real `<legend>`) so assistive tech announces the
 * group name with every field inside (the native fieldset/legend contract —
 * no ARIA needed).
 */
const Fieldset = el
  .config({ name: 'Fieldset' })
  .attrs({ tag: 'fieldset', direction: 'rows',
    contentDirection: 'rows',
    contentAlignX: 'left',
    contentAlignY: 'center', block: true, gap: 3 })
  .theme((t, m) => ({
    borderWidth: t.borderWidth.base,
    borderStyle: t.borderStyle.base,
    borderColor: tones(t, m).divider,
    borderRadius: t.borderRadius.base,
    paddingTop: t.spacing.medium,
    paddingBottom: t.spacing.medium,
    paddingLeft: t.spacing.medium,
    paddingRight: t.spacing.medium,
  }))

export default Fieldset

/** The fieldset's accessible group name — a real `<legend>`. */
export const FieldsetLegend = txt
  .config({ name: 'FieldsetLegend' })
  .attrs({ tag: 'legend' })
  .theme((t, m) => ({
    fontSize: t.fontSize.small,
    fontWeight: t.fontWeight.semibold,
    color: tones(t, m).textMuted,
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
  }))
