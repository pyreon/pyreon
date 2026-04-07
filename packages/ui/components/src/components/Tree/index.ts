import { rs } from '../../factory'
import { TreeBase } from '@pyreon/ui-primitives'

const Tree = rs({ name: 'Tree', component: TreeBase }).theme((t) => ({
  fontSize: t.fontSize.small,
  color: t.color.system.base[700],
}))

export default Tree
