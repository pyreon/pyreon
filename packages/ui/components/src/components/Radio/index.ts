import { RadioBase, RadioGroupBase } from '@pyreon/ui-primitives'
import { createComponent } from '../../factory'
import { radioTheme, radioGroupTheme } from './theme'

const Radio = createComponent('Radio', RadioBase, radioTheme)
export default Radio

export const RadioGroup = createComponent('RadioGroup', RadioGroupBase, radioGroupTheme)
