import { choiceBoxStyles, choiceBoxTheme, disabledState, el, focusRing, tones } from '../../factory'
import { CheckboxBase } from '@pyreon/ui-primitives'

const Checkbox = el.config({ name: 'Checkbox', component: CheckboxBase })
  .theme((t, m) => ({
    ...choiceBoxTheme(t, m),
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.spacing.xxSmall,
    cursor: 'pointer',
    color: tones(t, m).text,
    fontSize: t.fontSize.small,
    transition: t.transition.fast,
    focus: { ...focusRing(t), borderRadius: t.borderRadius.small },
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .sizes((t) => ({
    small: { fontSize: t.fontSize.xSmall, gap: t.spacing.xxSmall },
    medium: { fontSize: t.fontSize.small, gap: t.spacing.xxSmall },
    large: { fontSize: t.fontSize.base, gap: t.spacing.xSmall },
  }))
  .styles(choiceBoxStyles('square') as never)

export default Checkbox

export const CheckboxIndicator = el
  .config({ name: 'CheckboxIndicator' })
  .attrs({ tag: 'span', 'data-choice-indicator': '' } as never)
  .theme((t, m) => ({
    width: '18px',
    height: '18px',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: tones(t, m).border,
    borderRadius: t.borderRadius.small,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tones(t, m).surface,
    color: t.color.system.light.base,
    fontSize: '12px',
    transition: t.transition.fast,
    flexShrink: 0,
  }))
  .states((t) => ({
    checked: {
      backgroundColor: t.color.system.primary.base,
      borderColor: t.color.system.primary.base,
    },
  }))
  .sizes(() => ({
    small: { width: '14px', height: '14px', fontSize: '10px' },
    medium: { width: '18px', height: '18px', fontSize: '12px' },
    large: { width: '22px', height: '22px', fontSize: '14px' },
  }))
