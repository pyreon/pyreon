import rocketstyle from '@pyreon/rocketstyle'
import { SliderBase } from '@pyreon/ui-primitives'

const Slider = rocketstyle({ useBooleans: true })({ name: 'Slider', component: SliderBase as any })
  .theme({
    width: '100%',
    height: 6,
    cursor: 'pointer',
    appearance: 'none',
    backgroundColor: '#e5e7eb',
    borderRadius: 9999,
    outline: 'none',
    transition: 'background-color 200ms ease',
  })
  .states({
    primary: { backgroundColor: '#e5e7eb' },
    success: { backgroundColor: '#e5e7eb' },
    error: { backgroundColor: '#e5e7eb' },
  })
  .sizes({
    sm: { height: 4 },
    md: { height: 6 },
    lg: { height: 8 },
  })

export default Slider
