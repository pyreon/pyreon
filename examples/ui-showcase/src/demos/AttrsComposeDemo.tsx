import { attrs } from '@pyreon/attrs'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { Element } from '@pyreon/elements'
import { Title, Paragraph } from '@pyreon/ui-components'

// HOC wrappers
const withBorder = (Component: ComponentFn): ComponentFn => (props: Record<string, unknown>) =>
  (
    <div style="border: 2px dashed #3b82f6; border-radius: 8px; padding: 4px;">
      <Component {...props} />
    </div>
  ) as VNodeChild

const withBackground = (Component: ComponentFn): ComponentFn => (props: Record<string, unknown>) =>
  (
    <div style="background: #eff6ff; border-radius: 8px; padding: 4px;">
      <Component {...props} />
    </div>
  ) as VNodeChild

// .compose({ ... }) wraps the component with HOCs in order
const ComposedBox = attrs({ name: 'ComposedBox', component: Element })
  .attrs({ direction: 'rows', alignX: 'center', gap: 8, block: true })
  .compose({ withBorder, withBackground })

const cardStyle = 'padding: 16px; background: white; border-radius: 4px; max-width: 360px;'

export function AttrsComposeDemo() {
  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">.compose() — HOC chains</Title>
      <Paragraph style="margin-bottom: 24px">
        `.compose({ })` wraps the component with one or more higher-order components. Useful for cross-cutting concerns like borders, backgrounds, error boundaries, theming.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">ComposedBox = withBorder(withBackground(Box))</Title>
      <ComposedBox style={cardStyle}>
        Wrapped with withBorder + withBackground HOCs.
      </ComposedBox>
    </div>
  )
}
