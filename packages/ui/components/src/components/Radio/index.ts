import rocketstyle from '@pyreon/rocketstyle'
import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { radioTheme, radioGroupTheme } from './theme'

const rResolved = getComponentTheme(radioTheme)

const Radio = rocketstyle({ useBooleans: true })({ name: 'Radio', component: RadioBase as any })
  .theme(rResolved.base)
  .sizes(rResolved.sizes)

export default Radio

const rgResolved = getComponentTheme(radioGroupTheme)

export const RadioGroup = rocketstyle({ useBooleans: true })({ name: 'RadioGroup', component: RadioGroupBase as any })
  .theme(rgResolved.base)
