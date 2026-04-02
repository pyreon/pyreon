import rocketstyle from '@pyreon/rocketstyle'
import { SliderBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { sliderTheme } from './theme'

const resolved = getComponentTheme(sliderTheme)

const Slider = rocketstyle({ useBooleans: true })({ name: 'Slider', component: SliderBase as any })
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Slider
