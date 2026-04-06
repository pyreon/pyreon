import { Element } from '@pyreon/elements'
import { createComponent } from '../../factory'
import { stepperTheme, stepTheme } from './theme'

const Stepper = createComponent('Stepper', Element, stepperTheme, { tag: 'div' })
export default Stepper

export const Step = createComponent('Step', Element, stepTheme, { tag: 'div' })
