import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { buttonGroupTheme } from './theme'

const resolved = getComponentTheme(buttonGroupTheme)

const ButtonGroup = rocketstyle({ useBooleans: true })({ name: 'ButtonGroup', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .variants(resolved.variants)

export default ButtonGroup
