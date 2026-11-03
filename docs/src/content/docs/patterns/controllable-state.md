---
title: "Controlled / uncontrolled components"
summary: "Use useControllableState from @pyreon/hooks — never reimplement the isControlled/signal/getter pattern."
seeAlso: [signal-writes]
---

# Controlled / uncontrolled components

## The pattern

Use `useControllableState` (exported from `@pyreon/core`, and re-exported by `@pyreon/hooks`) for any primitive that exposes both controlled (`value` + `onChange`) and uncontrolled (`defaultValue`) props:

```tsx
import { useControllableState } from '@pyreon/hooks'

function Toggle(props: {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (next: boolean) => void
}) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,
    defaultValue: props.defaultChecked ?? false,
    onChange: props.onChange,
  })

  return (
    <button onClick={() => setChecked(!checked())}>
      {checked() ? 'on' : 'off'}
    </button>
  )
}
```

Key rules:

- Pass `value` as a **getter** (`() => props.checked`) so the controlled value is re-read inside reactive scopes; passing the value itself reads the prop once (dev mode warns). `defaultValue` is a plain value — it only seeds the internal state.
- The returned `checked` is a getter `() => boolean` — call it to read, and call `setChecked(next)` (or `setChecked((prev) => next)`) to write.
- `onChange` is optional in both modes; if omitted and the component is controlled, writes are no-ops (which is exactly what React's controlled contract prescribes).

## Why

Every primitive in `@pyreon/ui-primitives` needs this pattern. Before `useControllableState` landed, the logic was reimplemented by hand across ~15 components as:

```ts
const isControlled = () => props.value !== undefined
const internalValue = signal(props.defaultValue ?? null)
const value = () => (isControlled() ? props.value : internalValue())
```

That shape is subtly wrong — `props.value` is read once at setup in the `isControlled` closure, so switching modes at runtime breaks. The helper gets it right, once, and covers all primitives.

## Anti-pattern

```tsx
// BROKEN — manual isControlled + signal + getter
function Toggle(props) {
  const isControlled = props.checked !== undefined    // captured ONCE
  const internal = signal(props.defaultChecked ?? false)
  const checked = () => (isControlled ? props.checked : internal())
  // If props.checked transitions from undefined to defined, `isControlled`
  // stays false and the controlled path is never taken.
}
```

## Related

- Anti-pattern: "Duplicating controlled/uncontrolled pattern" in `architecture` category
- Reference API: `useControllableState` in `@pyreon/core` (re-exported by `@pyreon/hooks`) — see `get_api({ package: "hooks", symbol: "useControllableState" })`
