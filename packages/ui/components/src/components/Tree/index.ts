import rocketstyle from '@pyreon/rocketstyle'
import { TreeBase } from '@pyreon/ui-primitives'

const rs = rocketstyle({ useBooleans: true })

const Tree = rs({ name: 'Tree', component: TreeBase })
  .theme((t: any) => ({
    fontSize: t.fontSize.small,
    color: t.color.system.base[700],
  }))

export default Tree
