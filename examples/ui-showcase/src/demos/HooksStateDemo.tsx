import { useDebouncedValue, useInterval, usePrevious, useToggle } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Button, Title } from '@pyreon/ui-components'

export function HooksStateDemo() {
  // useToggle
  const visible = useToggle(false)

  // usePrevious
  const count = signal(0)
  const prev = usePrevious(() => count())

  // useDebouncedValue
  const search = signal('')
  const debounced = useDebouncedValue(() => search(), 500)

  // useInterval — reactive delay getter (returns null to pause).
  // The interval restarts whenever the getter's signal dependencies change.
  const ticks = signal(0)
  const running = signal(true)
  useInterval(() => ticks.set(ticks() + 1), () => (running() ? 1000 : null))

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">State Hooks</Title>

      <Title size="h3" style="margin-bottom: 12px">useToggle(initial)</Title>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <Button state="primary" onClick={() => visible.toggle()}>Toggle</Button>
        <Button state="secondary" onClick={() => visible.setTrue()}>Set true</Button>
        <Button state="secondary" onClick={() => visible.setFalse()}>Set false</Button>
        <span>Value: <strong>{() => String(visible.value())}</strong></span>
      </div>

      <Title size="h3" style="margin-bottom: 12px">usePrevious(value)</Title>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <Button state="primary" onClick={() => count.set(count() + 1)}>Increment</Button>
        <span>Current: <strong>{count()}</strong></span>
        <span>Previous: <strong>{() => String(prev() ?? 'undefined')}</strong></span>
      </div>

      <Title size="h3" style="margin-bottom: 12px">useDebouncedValue(value, 500ms)</Title>
      <input
        type="text"
        placeholder="Type quickly..."
        value={search()}
        onInput={(e: Event) => search.set((e.target as HTMLInputElement).value)}
        style="padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; max-width: 300px; margin-bottom: 8px;"
      />
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 24px;">
        Live: <strong>{() => search() || '(empty)'}</strong> | Debounced: <strong>{() => debounced() || '(empty)'}</strong>
      </p>

      <Title size="h3" style="margin-bottom: 12px">useInterval(fn, () =&gt; running() ? 1000 : null)</Title>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
        Reactive delay getter — returns null to pause, restarts on signal change.
      </p>
      <div style="display: flex; gap: 8px; align-items: center;">
        <Button state="primary" onClick={() => running.set(!running())}>
          {() => (running() ? 'Stop' : 'Start')}
        </Button>
        <Button state="secondary" onClick={() => ticks.set(0)}>Reset</Button>
        <span>Ticks: <strong>{ticks()}</strong></span>
      </div>
    </div>
  )
}
