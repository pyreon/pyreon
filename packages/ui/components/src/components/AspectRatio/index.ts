import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { aspectRatioTheme } from './theme'

const resolved = getComponentTheme(aspectRatioTheme)

const AspectRatio = rocketstyle({ useBooleans: true })({ name: 'AspectRatio', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)

export default AspectRatio
