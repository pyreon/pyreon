import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { imageTheme } from './theme'

const resolved = getComponentTheme(imageTheme)

const Image = rocketstyle({ useBooleans: true })({ name: 'Image', component: Element })
  .attrs({ tag: 'img' } as any)
  .theme(resolved.base)
  .variants(resolved.variants)

export default Image
