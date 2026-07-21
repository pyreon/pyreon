---
title: Localizing the UI System
description: Every override point for translating @pyreon/ui-components and @pyreon/ui-primitives — a11y label props, Intl-driven dates, and @pyreon/i18n wiring.
---

The Pyreon UI system is **localization-ready by prop override**: every
assistive-tech-facing string a component ships is an English *default* you can
replace per instance, and everything date-related is driven by
`Intl.DateTimeFormat` (no hardcoded month or weekday names anywhere). This
guide catalogs every override point and shows the `@pyreon/i18n` wiring.

## The model

There is no hidden translation registry inside the UI packages — localization
flows through **props**, so it composes with any i18n solution (or none). Three
kinds of surface exist:

1. **A11y label defaults** on presentational components (`aria-label` /
   `role`-adjacent strings) — override by passing the prop.
2. **Label props on behavior primitives** (`label`, `cellLabel`, `labels`) —
   structured override points for AT strings the primitive emits.
3. **`Intl`-driven dates** in Calendar — a `locale` prop, not string tables.

## 1. A11y label defaults (pass the prop)

These components carry English defaults via `.attrs()` — a direct prop always
wins:

| Component | Default | Override |
| --- | --- | --- |
| `Loader` | `aria-label="Loading"` | `<Loader aria-label="Načítání" />` |
| `CloseButton` | `aria-label="Close"` | `<CloseButton aria-label="Zavřít" />` |
| `Pagination` | `aria-label="Pagination"` | `<Pagination aria-label="Stránkování" />` |
| `Breadcrumb` | `aria-label="Breadcrumb"` | `<Breadcrumb aria-label="Drobečková navigace" />` |

## 2. Primitive label props

Behavior primitives expose structured label props for the strings they emit:

```tsx
import { ColorPickerBase, FileUploadBase, PinInputBase } from '@pyreon/ui-primitives'

// ColorPicker: the `labels` object covers the group + all three sliders;
// the *Value functions produce aria-valuetext, so translations control
// number formatting and placement too. Pass any subset — the rest keep
// their defaults.
<ColorPickerBase
  labels={{
    group: 'Farbwähler',
    hue: 'Farbton',
    hueValue: (deg) => `${deg} Grad`,
    saturation: 'Sättigung und Helligkeit',
    saturationValue: (s, b) => `Sättigung ${s} %, Helligkeit ${b} %`,
    opacity: 'Deckkraft',
    opacityValue: (pct) => `${pct} %`,
  }}
>
  {(state) => /* … */ null}
</ColorPickerBase>

// FileUpload: the drop-zone instruction string.
<FileUploadBase label="Dateien hochladen. Aktivieren zum Durchsuchen.">
  {(state) => /* … */ null}
</FileUploadBase>

// PinInput: per-cell labels as a function of (index, total).
<PinInputBase cellLabel={(i, n) => `Stelle ${i + 1} von ${n}`}>
  {(state) => /* … */ null}
</PinInputBase>
```

## 3. Dates: `Intl` end-to-end

`Calendar` (via `CalendarBase`) builds its weekday headers, month/year label,
and per-cell `aria-label`s from `Intl.DateTimeFormat` — pass a BCP-47 `locale`
and everything follows, including the full-date cell announcements:

```tsx
import { Calendar } from '@pyreon/ui-components'

<Calendar locale="cs-CZ" firstDayOfWeek={1} />
```

There are **no month-name arrays to translate** — `Intl` owns the strings.

## Wiring `@pyreon/i18n`

Because everything is a prop, the wiring is ordinary `t()` calls. Keep the
keys in your app's namespace and pass them down — reactively, so a language
switch updates in place:

```tsx
import { useI18n } from '@pyreon/i18n'
import { Loader, Pagination, Calendar } from '@pyreon/ui-components'

function Toolbar() {
  const { t, locale } = useI18n()
  return (
    <>
      {/* Reactive: the accessor re-reads t() on language change. */}
      <Loader aria-label={() => t('common.loading')} />
      <Pagination aria-label={() => t('common.pagination')} />
      <Calendar locale={locale()} />
    </>
  )
}
```

A practical convention is one `ui.*` namespace holding every UI-system string
your app overrides:

```json
{
  "ui": {
    "loading": "Načítání",
    "close": "Zavřít",
    "pagination": "Stránkování",
    "breadcrumb": "Drobečková navigace",
    "colorPicker": { "group": "Výběr barvy", "hue": "Odstín" }
  }
}
```

## Honest limits

- **No central label registry** — overrides are per call site. If your app
  renders `Loader` in thirty places, wrap it once
  (`const AppLoader = () => <Loader aria-label={() => t('ui.loading')} />`)
  rather than repeating the prop.
- **`locale` on Calendar** is read at mount in released versions — if your app
  supports live language switching, key the Calendar by locale
  (`<Show when={() => locale()}>` remount) unless your version notes say the
  formatters are reactive.
- Validation messages, form errors, and toast content are **app-owned
  strings** — they flow through `@pyreon/form` / `@pyreon/toast` APIs, not the
  UI components, and are covered by the i18n guide.
