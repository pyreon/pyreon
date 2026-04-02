import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { progressTheme } from './theme'

const resolved = getComponentTheme(progressTheme)

const Progress = rocketstyle({ useBooleans: true })({ name: 'Progress', component: Element })
  .attrs({ tag: 'div' } as any)
  .theme(resolved.base)
  .states(resolved.states)
  .sizes(resolved.sizes)

export default Progress
