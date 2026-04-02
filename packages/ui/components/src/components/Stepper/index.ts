import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { stepperTheme, stepTheme } from './theme'

const sResolved = getComponentTheme(stepperTheme)

const Stepper = rocketstyle({ useBooleans: true })({ name: 'Stepper', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(sResolved.base)
  .variants(sResolved.variants)

export default Stepper

const stResolved = getComponentTheme(stepTheme)

export const Step = rocketstyle({ useBooleans: true })({ name: 'Step', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(stResolved.base)
  .states(stResolved.states)
