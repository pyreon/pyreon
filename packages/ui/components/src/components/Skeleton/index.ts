import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { skeletonTheme } from './theme'

const resolved = getComponentTheme(skeletonTheme)

const Skeleton = rocketstyle({ useBooleans: true })({ name: 'Skeleton', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .variants(resolved.variants)

export default Skeleton
