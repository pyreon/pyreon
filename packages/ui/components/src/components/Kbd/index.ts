import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { kbdTheme } from './theme'

const resolved = getComponentTheme(kbdTheme)

const Kbd = rocketstyle({ useBooleans: true })({ name: 'Kbd', component: Text })
  .attrs({ tag: 'kbd' } as any)
  .theme(resolved.base)

export default Kbd
