---
title: "Best-Practice Mistakes (opt-in `@pyreon/lint` rules)"
description: "Common best-practice mistakes (opt-in `@pyreon/lint` rules) in Pyreon and how to fix them."
---

# Best-Practice Mistakes (opt-in `@pyreon/lint` rules)

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### `<img>` without `alt`

[`pyreon/require-img-alt`]: every `<img>` needs `alt` for screen readers. Add a descriptive `alt`, or `alt=""` if the image is purely decorative.

---

### `<img>` without `width`+`height`

[`pyreon/img-requires-dimensions`]: missing intrinsic dimensions cause Cumulative Layout Shift (CLS) as the image loads. Set both `width` and `height` (or a CSS `aspect-ratio`).

---

### `content-visibility: auto` without `contain-intrinsic-size`

[`pyreon/content-visibility-needs-intrinsic-size`]: `content-visibility: auto` makes the browser skip rendering an off-screen element and ESTIMATE its size; with no `contain-intrinsic-size` the estimate is wrong, so the box corrects on render and shoves content below it down — a Cumulative Layout Shift that's mobile-biased (narrow viewport ⇒ more off-screen content ⇒ more estimate→correct corrections) and invisible on fast desktop loads. This was the exact bug that capped bokisch.com/resume's mobile Lighthouse at 91 (single shift = the whole 0.145 CLS). Fix: `contain-intrinsic-size: auto <height>` next to it (camelCase `containIntrinsicSize` in style/theme objects); the `auto` keyword makes the browser remember the real size after first render. Detects the object-literal form (JSX `style={{}}` + styler/rocketstyle `.theme(()=>({}))`), `css`/`styled` tagged-template CSS, and string `style="…"`. Known limitation (opt-in + warn, so the bar is low): can't see a `contain-intrinsic-size` set on a different selector/object that this one inherits from — possible false positive; exempt via `exemptPaths` or an inline `// pyreon-lint-ignore`.

---

### Positive `tabIndex`

[`pyreon/no-positive-tabindex`, auto-fixable]: `tabIndex={n}` where n &gt; 0 hijacks the natural tab order and breaks keyboard navigation. Use `0` (focusable, natural order) or `-1` (programmatic focus only).

---

### Raw `<img>` in a `@pyreon/zero` app

[`pyreon/prefer-zero-image`]: prefer `@pyreon/zero`'s `<Image>` — it adds lazy-loading, `srcset`, and a blur placeholder for free.

---

### `useQuery` options as an object literal

`useQuery({ queryKey, queryFn })` captures the options ONCE. `@pyreon/query` hooks take options as a FUNCTION so `queryKey` can read signals and refetch reactively — wrap it: `useQuery(() => ({ queryKey: [id()], queryFn }))`. `useMutation` is the exception (its options are a plain object — imperative, no tracking).

**Detected by:** `query-options-as-function` — surfaced by `@pyreon/lint` / `pyreon doctor` / MCP `validate`.

---

### Nested `@pyreon/rx` transforms

[`pyreon/rx-prefer-pipe`]: `map(filter(src, p), f)` creates N intermediate computeds. Compose with `pipe(src, filter(p), map(f))` — one computed, one subscription.

---

### Signal read in `useForm({ initialValues })`

[`pyreon/no-signal-in-form-initial-values`]: `initialValues` is captured once at form setup, so `initialValues: { name: user() }` snapshots the signal and never updates. Pass the plain value, or use `form.setFieldValue` / a reactive field for dynamic defaults.

---

### `{t('…')}` interleaved with JSX

[`pyreon/i18n-prefer-trans-for-rich-jsx`]: when a translated string sits next to JSX element siblings (`<p>{t('cta')} <a>…</a></p>`), string interpolation can't safely carry the markup. Use `@pyreon/i18n`'s `<Trans>` component for rich/JSX interpolation. Plain text (`<h1>{t('title')}</h1>`) is fine — the rule only fires when element siblings make it "rich".

---

### Manual `new URLSearchParams(...)` in a router app

[`pyreon/prefer-typed-search-params`]: hand-parsing the query string loses type-coercion + SSR-safety. Use `@pyreon/router`'s `useTypedSearchParams({ page: 'number', q: 'string' })` — typed, auto-coerced, NaN-guarded, SSR-safe.

---
