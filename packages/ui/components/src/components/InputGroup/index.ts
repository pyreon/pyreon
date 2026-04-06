import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { inputGroupTheme } from './theme'

const resolved = getComponentTheme(inputGroupTheme)

const InputGroup = rocketstyle({ useBooleans: true })({ name: 'InputGroup', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default InputGroup
