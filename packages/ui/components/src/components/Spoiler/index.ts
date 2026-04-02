import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { spoilerTheme } from './theme'

const resolved = getComponentTheme(spoilerTheme)

const Spoiler = rocketstyle({ useBooleans: true })({ name: 'Spoiler', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default Spoiler
