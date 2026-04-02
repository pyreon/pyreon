import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { highlightTheme } from './theme'

const resolved = getComponentTheme(highlightTheme)

const Highlight = rocketstyle({ useBooleans: true })({ name: 'Highlight', component: Text })
  .attrs({ tag: 'span' } as any)
  .theme(resolved.base)
  .states(resolved.states)

export default Highlight
