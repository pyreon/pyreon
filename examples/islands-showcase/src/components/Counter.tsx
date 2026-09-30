import { state } from '@pyreon/core/plain'

export interface CounterProps {
  initial?: number
  label?: string
}

export default function Counter(props: CounterProps) {
  let count = state(props.initial ?? 0)
  return (
    <div data-testid="counter" style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;">
      <strong>{props.label ?? 'Counter'}:</strong>{' '}
      <span data-testid="counter-value">{count}</span>{' '}
      <button
        data-testid="counter-inc"
        type="button"
        onClick={() => { count = count + 1 }}
        style="margin-left: 8px;"
      >
        +
      </button>
    </div>
  )
}
