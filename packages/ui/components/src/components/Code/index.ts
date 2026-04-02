import { Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { getComponentTheme } from '@pyreon/ui-theme'
import { codeTheme } from './theme'

const resolved = getComponentTheme(codeTheme)

const Code = rocketstyle({ useBooleans: true })({ name: 'Code', component: Text })
  .attrs({ tag: 'code' } as any)
  .theme(resolved.base)
  .variants(resolved.variants)

export default Code
