import { signal } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import { el } from '../kit/bases'
import { Pill } from '../kit/controls'
import { KitScope } from '../kit/scope'

/**
 * The button Pills of a forced-theme panel on `/brand/kit`, as an island: the
 * page is static, so a button outside an island would do nothing. Each press
 * counts, so the specimen shows the button working in that theme. The nested
 * `PyreonUI` forces the panel's mode (it adds the same `data-theme` wrapper on
 * the server and in the browser); `KitScope` gives the island the site theme
 * when it hydrates as its own root.
 *
 * The root is a real box (`Row`) that lays the Pills out in a row. (It was
 * first added because the `visible` trigger could not see an island whose
 * content started under a nested provider's `display: contents` wrapper;
 * since pyreon/pyreon#4435 the trigger walks through those wrappers.)
 */
const Row = el.config({ name: 'KitScopePills' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })

export default function KitScopePills(props: { mode: 'dark' | 'light' }) {
  const solid = signal(0)
  const ghost = signal(0)

  return (
    <KitScope>
      <Row>
        <PyreonUI mode={props.mode}>
          <Pill variant="solid" onClick={() => solid.set(solid.peek() + 1)}>
            {() => `Solid · ${solid()}`}
          </Pill>
          <Pill onClick={() => ghost.set(ghost.peek() + 1)}>{() => `Ghost · ${ghost()}`}</Pill>
        </PyreonUI>
      </Row>
    </KitScope>
  )
}
