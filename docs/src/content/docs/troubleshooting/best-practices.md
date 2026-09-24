---
title: "Best-Practice Mistakes (opt-in `@pyreon/lint` rules)"
description: "Common best-practice mistakes (opt-in `@pyreon/lint` rules) in Pyreon and how to fix them."
---

# Best-Practice Mistakes (opt-in `@pyreon/lint` rules)

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### `<img>` without `alt`

[`pyreon/require-img-alt`]: add a descriptive `alt`, or `alt=""` for decorative images.

---

### `<img>` without `width`+`height`

[`pyreon/img-requires-dimensions`]: missing intrinsic dimensions cause layout shift (CLS). Set both, or a CSS `aspect-ratio`.

---

### `content-visibility: auto` without `contain-intrinsic-size`

[`pyreon/content-visibility-needs-intrinsic-size`]: the browser guesses the skipped element's size and corrects it on render, shifting content below (worst on mobile).
  - Add `contain-intrinsic-size: auto <height>` (`containIntrinsicSize` in style/theme objects); `auto` makes the browser remember the real size.
  - Checks style objects, `.theme()` objects, `css`/`styled` templates and `style="…"` strings. It cannot see a size set on another selector; exempt with `exemptPaths` or `// pyreon-lint-ignore`.

---

### Positive `tabIndex`

[`pyreon/no-positive-tabindex`, auto-fixable]: `tabIndex > 0` breaks natural tab order. Use `0` or `-1`.

---

### Raw `<img>` in a `@pyreon/zero` app

[`pyreon/prefer-zero-image`]: use `@pyreon/zero`'s `<Image>` for lazy-loading, `srcset` and a blur placeholder.

---

### `useQuery` options as an object literal

Options are read once. Pass a function so `queryKey` can track signals: `useQuery(() => ({ queryKey: [id()], queryFn }))`. `useMutation` takes a plain object.

**Detected by:** `query-options-as-function` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Nested `@pyreon/rx` transforms

[`pyreon/rx-prefer-pipe`]: `map(filter(src, p), f)` creates a computed per step. Use `pipe(src, filter(p), map(f))`.

---

### Signal read in `useForm({ initialValues })`

[`pyreon/no-signal-in-form-initial-values`]: `initialValues` is read once, so `{ name: user() }` is a snapshot. Pass the plain value, or use `form.setFieldValue` for dynamic defaults.

---

### `{t('…')}` interleaved with JSX

[`pyreon/i18n-prefer-trans-for-rich-jsx`]: when a translation sits beside element siblings (`<p>{t('cta')} <a>…</a></p>`), use `@pyreon/i18n`'s `<Trans>`. Plain `<h1>{t('title')}</h1>` is fine.

---

### Manual `new URLSearchParams(...)` in a router app

[`pyreon/prefer-typed-search-params`]: use `useTypedSearchParams({ page: 'number', q: 'string' })` from `@pyreon/router` (typed, coerced, NaN-guarded, SSR-safe).

---
