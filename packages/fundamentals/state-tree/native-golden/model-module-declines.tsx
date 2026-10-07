import { model } from '@pyreon/state-tree'
import { Text } from '@pyreon/primitives'

const badStep = model({ state: { n: 0 } })
  .extras(() => ({}))
  .create()
const badConfig = model(CONFIG).create()
const missingState = model({ views: {} }).create()
const nonObjectState = model({ state: SEED }).create()
const partialState = model({ state: { n: 1, bad: runtime, nil: null, [key]: 3 } }).create()
const emptyState = model({ state: {} }).create()
const computedConfig = model({ [key]: { n: 1 } }).create()
const badFactory = model({ state: { n: 1 } })
  .views({})
  .create()
const badSelf = model({ state: { n: 1 } })
  .views(({ n }) => ({ doubled: () => n() * 2 }))
  .create()
const badBody = model({ state: { n: 1 } })
  .views((self) => {
    return { doubled: () => self.n() * 2 }
  })
  .create()
const badMember = model({ state: { n: 1 } })
  .views((self) => ({ [key]: () => self.n() }))
  .create()
const nonFunction = model({ state: { n: 1 } })
  .actions((self) => ({ add: 1 }))
  .create()
const blockView = model({ state: { n: 1 } })
  .views((self) => ({
    doubled: () => {
      return self.n() * 2
    },
  }))
  .create()

export function ModelDeclines() {
  return <Text>Decline diagnostics</Text>
}
