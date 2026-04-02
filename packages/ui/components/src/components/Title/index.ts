import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { titleTheme } from './theme'

const resolved = getComponentTheme(titleTheme)

const Title = rocketstyle({ useBooleans: true })({ name: 'Title', component: Text })
  .attrs({ tag: 'h2' } as any)
  .theme(resolved.base)
  .sizes(resolved.sizes)

export default Title
