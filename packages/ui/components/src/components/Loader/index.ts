import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { loaderTheme } from './theme'

const resolved = getComponentTheme(loaderTheme)

const Loader = rocketstyle({ useBooleans: true })({ name: 'Loader', component: Element })
  .attrs({ tag: 'span' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)
  .variants(resolved.variants)

export default Loader
