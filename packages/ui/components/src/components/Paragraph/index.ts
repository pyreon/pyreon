import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { paragraphTheme } from './theme'

const resolved = getComponentTheme(paragraphTheme)

const Paragraph = rocketstyle({ useBooleans: true })({ name: 'Paragraph', component: Text })
  .attrs({ tag: 'p' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Paragraph
