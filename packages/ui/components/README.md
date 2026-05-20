# @pyreon/ui-components

> **Private — internal to the Pyreon monorepo. Not published to npm.**

67 rocketstyle components across 10 categories, built on `@pyreon/elements` + `@pyreon/rocketstyle` + `@pyreon/styler` and themed by `@pyreon/ui-theme`. Every component carries the rocketstyle dimension surface (`state` / `size` / `variant` / `useDarkMode`) with `useBooleans: false` semantics — props accept string values (`state="primary"`, `size="medium"`), not booleans. The component library Pyreon demos itself with — the canonical real-app shape that's used by example apps under `examples/` and exercised end-to-end in the `ui-showcase` Playwright suite.

## Quick start

```tsx
import { PyreonUI } from '@pyreon/ui-core'
import theme from '@pyreon/ui-theme'
import {
  Button, Card, Badge, Alert,
  Input, Modal, Tabs, Tab, TabPanel,
} from '@pyreon/ui-components'

<PyreonUI theme={theme} mode="system">
  <Card>
    <Badge state="success" size="small">Active</Badge>
    <Alert state="info">Welcome back.</Alert>

    <Tabs defaultValue="account">
      <Tab value="account">Account</Tab>
      <Tab value="security">Security</Tab>
      <TabPanel value="account">
        <Input label="Email" type="email" />
      </TabPanel>
      <TabPanel value="security">
        <Input label="Current password" type="password" />
      </TabPanel>
    </Tabs>

    <Button state="primary" size="medium">Save</Button>
  </Card>
</PyreonUI>
```

## Components by category

### Layout (7)

`Box`, `Stack`, `Group`, `Center`, `Divider`, `AspectRatio`, plus the simple-grid trio `GridContainer` / `GridRow` / `GridCol`.

### Typography (2)

`Title`, `Paragraph`.

### Buttons (5)

`Button`, `CloseButton`, `IconButton`, `ButtonGroup`, `ActionIcon`.

`Button` ships dimensions:
- **states**: `primary`, `secondary`, `danger`, `success`
- **sizes**: `small`, `medium`, `large`
- **variants**: `solid` (default), `outline`, `subtle`, `ghost`, `link`

### Forms (10)

`FormField` (+ `FieldLabel`, `FieldDescription`, `FieldError`), `Input`, `Textarea`, `Checkbox` (+ `CheckboxIndicator`), `Radio` (+ `RadioGroup`, `RadioIndicator`, `RadioDot`), `Switch` (+ `SwitchThumb`), `Select`, `Slider`.

### Data display (10)

`Badge`, `Chip`, `Card`, `Avatar` (+ `AvatarGroup`), `Image`, `Kbd`, `Table`, `Timeline`, `Code`, `Highlight`.

### Feedback (5)

`Alert`, `Notification`, `Progress`, `Loader`, `Skeleton`.

### Indicators (1)

`Indicator`.

### Overlays (7)

`Modal`, `Drawer`, `Dialog`, `Tooltip`, `Popover`, `HoverCard`, `Menu` (+ `MenuItem`).

### Navigation (6)

`Tabs` (+ `Tab`, `TabPanel`), `Breadcrumb` (+ `BreadcrumbItem`), `Pagination`, `NavLink`, `Stepper` (+ `Step`).

### Disclosure (2)

`Accordion` (+ `AccordionItem`, `AccordionTrigger`, `AccordionContent`), `Spoiler`.

### Date & time (6)

`Calendar`, `DatePicker`, `DateRangePicker`, `TimePicker`, `DateTimePicker`, `MonthPicker`.

### Advanced inputs (10)

`Combobox`, `Autocomplete`, `MultiSelect`, `FileUpload`, `ColorPicker`, `ColorSwatch`, `InputGroup`, `NumberInput`, `PinInput`, `SegmentedControl` (+ `SegmentedControlItem`).

### Data (1)

`Tree` (+ `TreeItem`).

### Accessibility (1)

`VisuallyHidden`.

## Architecture

Components are built from three base factories re-exported from `src/factory.ts`:

| Factory | Renders | Use for |
|---|---|---|
| `el` | `<Element>` (block layout) | Buttons, Cards, Layouts — anything that needs `direction`, `gap`, `alignX`, `alignY` |
| `txt` | `<Text>` (inline typography) | Headings, paragraphs, links |
| `list` | `<List>` (data-driven children) | Lists with positional metadata |
| `rs` | Bare rocketstyle | Components that don't need Element's layout surface |

Plus `MaybeNull`, `ObjectValue`, `SimpleValue` types for `list` data shapes.

### Layout in `.attrs()`, CSS in `.theme()`

```tsx
const Button = el
  .config({ name: 'Button' })
  // Layout — targets Element's inner layout
  .attrs({ tag: 'button', direction: 'inline', alignX: 'center', alignY: 'center', gap: 8 })
  // Visual styles — targets the styled outer wrapper
  .theme((t) => ({
    fontSize: t.fontSize.base,
    borderRadius: t.borderRadius.base,
    cursor: 'pointer',
    transition: t.transition.base,
    // Pseudo-states are objects inside .theme()
    focus: { boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`, outline: 'none' },
    disabled: { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' },
    active: { transform: 'scale(0.98)' },
  }))
  .states((t) => ({
    primary: { backgroundColor: t.color.system.primary.base, color: t.color.system.light.base,
               hover: { backgroundColor: t.color.system.primary[800] } },
    secondary: { /* … */ },
    danger:    { /* … */ },
    success:   { /* … */ },
  }))
  .sizes((t) => ({
    small:  { fontSize: t.fontSize.small,  paddingTop: t.spacing.xSmall, /* … */ },
    medium: { fontSize: t.fontSize.base,   paddingTop: t.spacing.small,  /* … */ },
    large:  { fontSize: t.fontSize.medium, paddingTop: t.spacing.medium, /* … */ },
  }))
  .variants((t) => ({
    solid:   {},
    outline: { backgroundColor: t.color.system.transparent, borderColor: t.color.system.primary.base, /* … */ },
    subtle:  { /* … */ },
    ghost:   { /* … */ },
    link:    { /* … */ },
  }))
```

## Conventions

- **`useBooleans: false`** — `<Button state="primary" size="medium">`, NOT `<Button primary medium>`. This is the rocketstyle default; consumers shouldn't try to opt back in via `{ useBooleans: true }`.
- **`:hover` is unconditional** — applied to every component that defines hover theme, not just interactive ones. Only `cursor: pointer` is gated on `onClick` / `href`.
- **CSS property naming follows unistyle convention** — `borderWidthTop`, NOT CSS-spec `borderTopWidth`. Property-first.
- **Pseudo-states are objects** — `hover: {…}`, `focus: {…}`, `active: {…}`, `disabled: {…}` inside `.theme()` callbacks. The bases generate `:hover` / `:focus-visible` / `:active` / `:disabled` CSS.
- **Sizes are touch-friendly** — menu items, dropdown options, and interactive list items use `t.spacing.small` (8px) vertical / `t.spacing.medium` (12px) horizontal at minimum.
- **Semantic HTML via `.config({ component })`** — sets the outer rocketstyle element tag (e.g. `component: 'nav'` for nav containers). `tag` in `.attrs()` sets the Element's inner tag.

## Behaviour primitives

Components that need state machines (combobox filtering, calendar date math, tabs keyboard nav, focus trap, ARIA, etc.) compose on top of `@pyreon/ui-primitives` — the headless `*Base` components. `@pyreon/ui-components` provides the styled UI; `@pyreon/ui-primitives` provides the behaviour. Example: `Combobox` (this package) wraps `ComboboxBase` (primitives package) and adds rocketstyle theming.

## Hooks composition

Where DOM behaviour is needed (event listeners, scroll lock, click-outside, overlay positioning), components use `@pyreon/hooks` (`useEventListener`, `useScrollLock`, `useClickOutside`) and `@pyreon/elements`' `Overlay` + `useOverlay`. Components do NOT call raw `addEventListener` / `removeEventListener`.

## Theme augmentation

`@pyreon/ui-theme` globally augments `ThemeDefault extends Theme` and `StylesDefault extends ITheme` — consumer apps MUST NOT re-augment those interfaces (would trigger TS2320). The `t` parameter inside `.theme()` / `.states()` / `.sizes()` / `.variants()` is typed as the full theme shape from `@pyreon/ui-theme`.

## Gotchas

- **Dimensions are string-valued.** `state="primary"` not `state` (boolean). The TS types reject the boolean form.
- **Components run once.** Don't reach for "re-render" mental models — signal-driven changes patch DOM in place. Reactive props need to be read inside reactive scopes (JSX expression thunks, effects, computeds).
- **Theme augmentation conflict.** Re-declaring `ThemeDefault` in your app's `pyreon.d.ts` causes `TS2320: Interface incorrectly extends`. Don't.
- **`useBooleans: true` is unsupported as a global default.** The components in this package compile against `useBooleans: false`.

## License

MIT (private to the Pyreon monorepo).
