---
title: "Dynamic form arrays — useFieldArray"
summary: "Stable keys for <For by> via .key, never the array index."
seeAlso: [form-fields, keyed-lists]
---

# Dynamic form arrays — useFieldArray

## The pattern

Manage variable-length form inputs with `useFieldArray`. Each item has a **stable monotonic key** — use it with `<For by>` so reordering/insertion preserves input focus and DOM state:

```tsx
import { useFieldArray, For } from '@pyreon/form'

function TagEditor() {
  const tags = useFieldArray<string>(['typescript', 'signals'])

  // Full mutation surface
  tags.append('reactive')
  tags.prepend('pyreon')
  tags.insert(1, 'framework')
  tags.move(0, 3)
  tags.swap(1, 2)
  tags.replace(['a', 'b', 'c'])
  tags.remove(0)

  // Render — ALWAYS use `by={i => i.key}`, never the index
  return (
    <>
      <For each={tags.items()} by={(item) => item.key}>
        {(item) => (
          <input
            value={() => item.value()}
            onInput={(e) => item.value.set(e.currentTarget.value)}
          />
        )}
      </For>
      <button onClick={() => tags.append('')}>Add tag</button>
    </>
  )
}
```

## Why keys matter

`item.key` is a monotonically increasing number assigned at insert time — **not** the array index. Reordering doesn't change keys, so Pyreon's keyed reconciler reuses the same `<input>` DOM node for the same logical item. Input focus, IME composition, and scroll position all survive the reorder.

Index-based keys defeat the whole design: moving item 0 to index 2 means every input from index 0..2 gets mapped to a DIFFERENT logical item, so a user mid-typing in one field suddenly sees the text from another.

## Anti-pattern

```tsx
// BROKEN — index-based key scrambles focus on reorder
const BadList = () => (
  <For each={tags.items()} by={(_, i) => i}>
    {(item) => <input value={() => item.value()} />}
  </For>
)
```

```tsx
function Bad() {
  // BROKEN — stored items array at setup, loses reactivity
  const items = tags.items()
  return <For each={items}>{() => null}</For>
}

function Good() {
  // Correct — read inside a reactive scope
  return (
    <For each={tags.items()} by={(i) => i.key}>
      {() => null}
    </For>
  )
}
```

```tsx
// BROKEN — index for deletion is a race condition after reorder
const BadRemove = (i: number) => <button onClick={() => tags.remove(i)}>×</button>

// If the user reordered, the `i` captured at render time no longer
// matches the item they clicked. Use the item identity instead:
const GoodRemove = (item: { key: number }) => (
  <button onClick={() => tags.remove(tags.items().findIndex((x) => x.key === item.key))}>×</button>
)
```

Cleanest: the `useFieldArray` API takes a key-or-predicate for mutations. Check `get_api({ package: "form", symbol: "useFieldArray" })` for the full surface.

## Related

- Pattern: `keyed-lists` for the same `by={item => item.key}` concern on any `<For>`
- Pattern: `form-fields` for the outer form composition
- Detector: `for-missing-by` — fires on bare `<For each>` without `by`
- Anti-pattern: "Stable keys in `useFieldArray`" in `form` context
