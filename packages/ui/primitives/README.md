# @pyreon/ui-primitives

> **Private — internal to the Pyreon monorepo. Not published to npm.**

Headless behavior primitives — state machines, ARIA wiring, keyboard navigation, focus management — that the styled `@pyreon/ui-components` library composes on top of. Each primitive is a `*Base` component that either renders a minimal accessible host element (Switch, Tab, Modal) or exposes a render-function `(state) => VNodeChild` for full presentational control (Combobox, Calendar, Tree, FileUpload). All controlled/uncontrolled state goes through `useControllableState` from `@pyreon/hooks` — never reimplemented inline. Render-function primitives ship ARIA-helper objects (`inputProps()`, `listboxProps()`, `getOptionProps()`) so consumers don't hand-author `role` / `aria-*` attributes.

## Quick start

```tsx
import { signal } from '@pyreon/reactivity'
import { SwitchBase, ComboboxBase, ModalBase, TabsBase, TabBase, TabPanelBase } from '@pyreon/ui-primitives'

// 1. Light primitive — renders directly
<SwitchBase
  checked={enabled()}
  onChange={enabled.set}
  aria-invalid={false}
>
  Notifications
</SwitchBase>

// 2. Render-function primitive — you control the markup
<ComboboxBase
  options={[
    { value: 'al', label: 'Alice' },
    { value: 'bo', label: 'Bob' },
  ]}
  value={selected()}
  onChange={selected.set}
>
  {(state) => (
    <>
      <input {...state.inputProps()} />
      {state.isOpen() && (
        <ul {...state.listboxProps()}>
          {state.filtered().map((opt, i) => (
            <li {...state.getOptionProps(opt.value, i)}>{opt.label}</li>
          ))}
        </ul>
      )}
    </>
  )}
</ComboboxBase>

// 3. Context-based primitive (Tabs)
<TabsBase value={tab()} onChange={tab.set}>
  <div role="tablist">
    <TabBase value="general">General</TabBase>
    <TabBase value="advanced">Advanced</TabBase>
  </div>
  <TabPanelBase value="general">…</TabPanelBase>
  <TabPanelBase value="advanced">…</TabPanelBase>
</TabsBase>
```

## Primitives

### `CalendarBase` — date picking

```ts
<CalendarBase
  value={selectedDate()}        // CalendarDate | null — { year, month, day } (month 0-11)
  defaultValue={...}
  onChange={(d) => ...}
  min={...} max={...}
  disabledDates={(d) => isWeekend(d)}
  locale="en-US"                // weekday + month names
  firstDayOfWeek={1}            // 0 = Sunday, 1 = Monday (default 1)
>
  {(state) => /* state.days(), state.weekdays(), state.monthLabel(), state.prevMonth(), … */ }
</CalendarBase>
```

Exposes the full grid (`days()` returns `CalendarDay[][]` — one row per week, with `isCurrentMonth` / `isToday` / `isSelected` / `isDisabled` per cell), navigation (`prevMonth` / `nextMonth` / `prevYear` / `nextYear` / `goTo`), localized weekday + month labels, and `isSelected` / `isDisabled` / `isToday` / `isCurrentMonth` predicates.

### `CheckboxBase` — checkbox

Manages `checked` / `defaultChecked` / `indeterminate` through `useControllableState`. Renders a checkbox `<input>` with the correct ARIA. Disabled-state aware.

### `ColorPickerBase` — color picker

Signal-driven HSL state (`hue` / `saturation` / `lightness` / `alpha`), helpers for converting to hex/RGB/HSL, render-function for the saturation/lightness square + hue slider markup.

### `ComboboxBase` — searchable single/multi-select

Render-function primitive. State exposes:

- `query()` / `setQuery(s)` — controlled search input
- `filtered()` — options filtered by `query()`
- `isOpen()` / `open()` / `close()` / `toggle()` — dropdown state
- `highlightedIndex()` — keyboard-driven highlight
- `selected()` / `select(value)` / `remove(value)` / `clear()` — selection (single or multi)
- `isSelected(value)` / `getLabel(value)`
- `onKeyDown(e)` — drop-in WAI-ARIA listbox keyboard handler: ArrowUp/ArrowDown (ArrowDown opens a closed listbox), `Home`/`End` (first/last option), Enter (select), Escape/Tab (close), and **typeahead** — printable characters jump the active option to the next label starting with the typed buffer (resets after ~500ms idle; a repeated letter cycles through matches)
- `inputProps()` / `listboxProps()` / `getOptionProps(value, index)` — ARIA helpers

### `FileUploadBase` — drag-drop + click upload

Render-function primitive. State exposes:

- `isDragging()` — drop-zone hover state
- `files()` / `clear()` / `removeFile(index)`
- `openPicker()` — programmatically open the native file dialog
- `dropZoneProps` — `{ onDragOver, onDragLeave, onDrop }` to spread on the zone
- `inputProps` — `{ type: 'file', accept, multiple, onChange, style }` for the hidden `<input>`
- `inputRef` — ref to the hidden `<input type="file">`

Accept/maxFiles/maxSize validation built in.

### `ModalBase` — modal / dialog shell

Light primitive — renders a `Portal` into `document.body` with overlay + content, manages ESC key (`closeOnEscape`, default `true`), overlay click (`closeOnOverlay`, default `true`), scroll lock via `useScrollLock`. Always mounts (so scroll lock + ESC work reactively); renders children only when `open` is true. Returns `null` in SSR.

### `RadioGroupBase` + `RadioBase` — single-select radio group

Context-based (`useRadioGroup` for advanced consumers). `RadioBase` reads selected state + handlers from context, exposes `aria-checked`, handles `name` attribute, and supports all four arrow keys + Home/End via the shared `navigateByRole` keyboard helper.

### `SelectBase` — native `<select>` wrapper

Controlled/uncontrolled wrapper around native `<select>` — ARIA-correct out of the box, handles disabled options.

### `SliderBase` — slider / range input

Manages value (number or `[min, max]` tuple for range), step / min / max, keyboard nav (Arrow / PageUp / PageDown / Home / End), pointer drag.

### `SwitchBase` — toggle / switch

Renders `<button role="switch" aria-checked>` with the correct keyboard semantics (Space / Enter toggles). Disabled-state aware. Lightest primitive — no render function needed.

### `TabsBase` + `TabBase` + `TabPanelBase` + `useTabs()`

Context-based. `TabsBase` provides the controlled value + `onChange`; `TabBase` renders one tab trigger with ARIA `role="tab"` + keyboard nav (Left/Right arrows, Home/End) via `navigateByRole`; `TabPanelBase` renders its panel only when its `value` matches the active tab (uses the reactive conditional pattern). `useTabs()` exposes `{ value, onChange }` for advanced render needs.

### `TreeBase` — hierarchical selection

Render-function primitive. State exposes expanded set (`expanded()` / `toggleExpand(id)` / `expand(id)` / `collapse(id)`), selection (`selected()` / `select(id)`), focus (`focused()` / `focus(id)`), single/multi-select via the `multiple` prop, `onExpand` for lazy-loading children, `treeProps()` / `getItemProps(node, depth)` ARIA helpers. `onKeyDown(e)` is the WAI-ARIA tree keyboard handler: ArrowUp/ArrowDown (move between visible nodes), ArrowRight (expand / enter child), ArrowLeft (collapse), Enter/Space (select), `Home`/`End` (first/last **visible** node — collapsed subtrees excluded), **`*`** (expand all siblings at the focused node's level), and **typeahead** (jump to the next visible node whose label starts with the typed buffer; resets after ~500ms idle; a repeated letter cycles).

## Shared keyboard helper

`keyboard.ts` exports `navigateByRole(e, options)` — the canonical arrow-key navigation between sibling elements with a specific ARIA role. Used by `TabBase` (`ArrowLeft` / `ArrowRight`) and `RadioBase` (all four arrows + Home/End). Returns the `data-value` of the activated element, or `null` if no navigation key fired.

```ts
const value = navigateByRole(e, {
  containerSelector: '[role="tablist"]',
  itemSelector: '[role="tab"]',
  keys: 'horizontal',  // 'horizontal' | 'vertical' | 'both'
})
if (value) tabs.onChange(value)
```

`keyboard.ts` also exports the shared **typeahead** helpers used by `ComboboxBase` and `TreeBase`:

- `createTypeahead(resetMs = 500)` — a per-instance printable-character buffer (`{ push(key), clear() }`) that accumulates single characters and resets after `resetMs` of idle. Create ONE per primitive instance.
- `typeaheadMatch(labels, buffer, currentIndex)` — pure, case-insensitive prefix matcher returning the next matching index (or `-1`). A single repeated character cycles from `currentIndex + 1`; a longer buffer refines from `currentIndex`. Pass `currentIndex = -1` when there is no active item yet (closed combobox / unfocused tree) so the first keystroke lands on the first match.

## Conventions

- **Use `useControllableState`** — every primitive with controlled/uncontrolled state pulls `useControllableState({ value, defaultValue, onChange })` from `@pyreon/hooks`. Never duplicate the `isControlled + signal + getter` pattern.
- **Use `@pyreon/hooks` for DOM behaviour** — `useEventListener` (document / window listeners), `useScrollLock` (modal overflow), `useClickOutside`, `useFocusTrap`. Never call raw `addEventListener` / `removeEventListener`.
- **Render-function primitives provide ARIA helpers** — `ComboboxBase` exposes `inputProps()` / `listboxProps()` / `getOptionProps(...)`; `TreeBase` exposes `treeProps()` / `getItemProps(...)`; `FileUploadBase` exposes `inputProps` / `dropZoneProps`. Consumers do NOT hand-author `role` / `aria-*` attributes.
- **ARIA STATE is a STRING, never a boolean** — `aria-checked` / `aria-selected` / `aria-invalid` / `aria-disabled` / `aria-multiselectable` etc. must be `'true'` / `'false'` / `'mixed'` (or `undefined` to omit), never a bare boolean. A boolean `x || undefined` leaks a presence-only `aria-*=""` on the compiler's template path (which AT reads as the default → the OPPOSITE state), and relies on the runtime `applyStaticProp` coercion net everywhere else. Write `x ? 'true' : undefined` (or `x ? 'true' : 'false'` when the false state must be announced). Every primitive here follows this; `aria-state.browser.test.tsx` locks it.
- **Reactive conditional rendering** — return a thunk for branches: `return (() => own.open ? <Portal>…</Portal> : null)`. Components run once; an early `return null` outside a thunk freezes the branch.
- **SSR-safe** — primitives that touch `document` (Modal's portal target) guard with `typeof document === 'undefined' ? null : …` at entry.
- **No `as unknown as VNodeChild` casts** — `JSX.Element` is assignable to `VNodeChild`. The cast is unnecessary; remove it where you see it.

## Gotchas

- **`TabPanelBase` mounts conditionally.** It's a reactive `<Show>`-style component — when its `value` doesn't match the active tab, the panel subtree unmounts entirely. Effects in unmounted panels won't fire.
- **`ModalBase` always mounts.** The wrapper is always in the tree (so scroll lock + ESC listener register on first mount); only the inner Portal content is gated on `open`.
- **Tab keyboard nav uses `[role="tablist"]` / `[role="tab"]`** as the container/item selectors. If you author a custom Tab styled wrapper, make sure those roles reach the rendered DOM, or `navigateByRole` won't find the siblings.
- **`ComboboxBase`'s `filtered()` is computed against `query()`** — leave `query` empty to show all options.
- **`useTabs()` outside `<TabsBase>` returns a no-op context.** Default value's `value()` returns `''` and `onChange` is a no-op — useful for top-level rendering without crashing, but tab triggers won't activate.

## License

MIT (private to the Pyreon monorepo).
