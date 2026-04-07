import { rs } from '../../factory'
import { SliderBase } from '@pyreon/ui-primitives'

const Slider = rs({ name: 'Slider', component: SliderBase })
  .theme((t) => ({
    width: '100%',
    backgroundColor: t.color.system.base[200],
    borderRadius: t.borderRadius.pill,
    position: 'relative',
    cursor: 'pointer',
    transition: t.transition.fast,
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
    },
    disabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
      pointerEvents: 'none',
    },
  }))
  .sizes(() => ({
    small: { height: '4px' },
    medium: { height: '6px' },
    large: { height: '8px' },
  }))

export default Slider
