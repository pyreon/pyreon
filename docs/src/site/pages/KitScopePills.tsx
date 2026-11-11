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
 * The root is a real box (`Row`), not the provider: a nested provider's
 * wrapper is `display: contents`, and the `visible` trigger cannot see an
 * island whose content starts under one (pyreon/pyreon#4435), so the island
 * never hydrated.
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
