import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { numberInputTheme } from './theme'

const resolved = getComponentTheme(numberInputTheme)

const NumberInput = rocketstyle({ useBooleans: true })({ name: 'NumberInput', component: Element })
  .attrs({ tag: 'input', block: true } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default NumberInput
