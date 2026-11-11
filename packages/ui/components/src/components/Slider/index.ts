import { disabledState, el, focusRing, tones } from '../../factory'
import { SliderBase } from '@pyreon/ui-primitives'

const Slider = el.config({ name: 'Slider', component: SliderBase })
  .theme((t, m) => ({
    width: '100%',
    backgroundColor: tones(t, m).border,
    borderRadius: t.borderRadius.pill,
    position: 'relative',
    cursor: 'pointer',
    transition: t.transition.fast,
    focus: focusRing(t),
    disabled: { ...disabledState(), pointerEvents: 'none' },
  }))
  .sizes(() => ({
    small: { height: '4px' },
    medium: { height: '6px' },
    large: { height: '8px' },
  }))

export default Slider
