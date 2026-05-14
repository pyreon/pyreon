import { signal } from '@pyreon/reactivity'
import { Button, CloseButton, IconButton, Title } from '@pyreon/ui-components'

export function ButtonDemo() {
  const count = signal(0)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Button</Title>

      <Title size="h3" style="margin-bottom: 12px">States</Title>
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <Button state="primary">Primary</Button>
        <Button state="secondary">Secondary</Button>
        <Button state="danger">Danger</Button>
        <Button state="success">Success</Button>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Sizes</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Button state="primary" size="small">Small</Button>
        <Button state="primary" size="medium">Medium</Button>
        <Button state="primary" size="large">Large</Button>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Variants</Title>
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <Button state="primary" variant="solid">Solid</Button>
        <Button state="primary" variant="outline">Outline</Button>
        <Button state="primary" variant="subtle">Subtle</Button>
        <Button state="primary" variant="ghost">Ghost</Button>
        <Button state="primary" variant="link">Link</Button>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Interactive</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Button state="primary" onClick={() => count.update((n) => n + 1)}>
          Clicked: {count()}
        </Button>
        <Button state="danger" variant="outline" onClick={() => count.set(0)}>
          Reset
        </Button>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Icon Buttons</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <IconButton size="small">+</IconButton>
        <IconButton size="medium">...</IconButton>
        <IconButton size="large">?</IconButton>
        <CloseButton size="small">x</CloseButton>
        <CloseButton size="medium">x</CloseButton>
      </div>

      {/* Reactive-prop regression — a signal feeds the `title` prop on
          a rocketstyle Button. Pre-fix, the rocketstyle pipeline value-
          copied the prop at HOC setup time, collapsing the getter to a
          static value and breaking signal-driven DOM updates. The
          rendered title attribute must update when the counter clicks
          fire. See e2e/ui-showcase-regression.spec.ts. */}
      <Title size="h3" style="margin-bottom: 12px">Reactive Props</Title>
      <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 24px;">
        <Button
          data-testid="reactive-prop-button"
          state="primary"
          title={`count: ${count()}`}
          onClick={() => count.update((n) => n + 1)}
        >
          Click to bump signal
        </Button>
      </div>
    </div>
  )
}
