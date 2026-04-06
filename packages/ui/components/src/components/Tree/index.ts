import rocketstyle from '@pyreon/rocketstyle'
import { TreeBase } from '@pyreon/ui-primitives'
import { getComponentTheme } from '@pyreon/ui-theme'
import { treeTheme } from './theme'

const resolved = getComponentTheme(treeTheme)

const Tree = rocketstyle({ useBooleans: true })({ name: 'Tree', component: TreeBase as any })
  .theme(resolved.base)

export default Tree
