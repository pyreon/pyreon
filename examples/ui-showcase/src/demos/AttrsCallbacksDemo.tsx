import { attrs } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

type Variant = 'primary' | 'success' | 'danger'
type Mood = 'happy' | 'sad'

const variantColors: Record<Variant, string> = {
  primary: '#0070f3',
  success: '#10b981',
  danger: '#ef4444',
}

// 1. Callback attrs — compute defaults from consumer-supplied props
const ColorBox = attrs({ name: 'ColorBox', component: Element }).attrs<{
  variant?: Variant
}>((props) => ({
  direction: 'inline',
  alignX: 'center',
  alignY: 'center',
  block: true,
  label: variantColors[props.variant ?? 'primary'],
}))

// 2. Priority attrs — locked, can't be overridden by consumer
const LockedDir = attrs({ name: 'LockedDir', component: Element })
  .attrs({ direction: 'rows' }, { priority: true })
  .attrs({ alignX: 'center', alignY: 'center', gap: 8, block: true })

// 3. Filtered attrs — strip consumer props before forwarding to inner component
const FilteredBox = attrs({ name: 'FilteredBox', component: Element }).attrs<{
  mood?: Mood
}>(
  (props) => ({
    direction: 'inline',
    alignX: 'center',
    alignY: 'center',
    block: true,
    label: props.mood === 'happy' ? '😊 Happy' : '😢 Sad',
  }),
  { filter: ['mood'] },
)

const boxStyle = 'padding: 16px; background: #f3f4f6; border-radius: 8px; max-width: 320px; margin-bottom: 16px;'

export function AttrsCallbacksDemo() {
  const variant = signal<Variant>('primary')
  const mood = signal<Mood>('happy')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Callbacks, Priority, Filter</Title>
      <Paragraph style="margin-bottom: 24px">
        Advanced .attrs() features: compute defaults from props, lock props with priority, strip props from forwarding with filter.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Callback attrs — variant prop</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <Button
          state={variant() === 'primary' ? 'primary' : 'secondary'}
          onClick={() => variant.set('primary')}
        >
          Primary
        </Button>
        <Button
          state={variant() === 'success' ? 'success' : 'secondary'}
          onClick={() => variant.set('success')}
        >
          Success
        </Button>
        <Button
          state={variant() === 'danger' ? 'danger' : 'secondary'}
          onClick={() => variant.set('danger')}
        >
          Danger
        </Button>
      </div>
      <ColorBox variant={variant()} style={boxStyle}>
        ColorBox computes label color from variant prop
      </ColorBox>

      <Title size="h3" style="margin-bottom: 12px">Priority attrs — locked direction</Title>
      <LockedDir direction="inline" style={boxStyle}>
        Tried to set direction="inline" but priority lock keeps it as "rows"
      </LockedDir>

      <Title size="h3" style="margin-bottom: 12px">Filtered attrs — mood prop stripped</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <Button
          state={mood() === 'happy' ? 'primary' : 'secondary'}
          onClick={() => mood.set('happy')}
        >
          Happy
        </Button>
        <Button
          state={mood() === 'sad' ? 'primary' : 'secondary'}
          onClick={() => mood.set('sad')}
        >
          Sad
        </Button>
      </div>
      <FilteredBox mood={mood()} style={boxStyle}>
        FilteredBox uses mood internally but doesn't forward it to Element
      </FilteredBox>
    </div>
  )
}
