# Security

Pyreon includes built-in protections against common web vulnerabilities. This page documents the security features and best practices.

## HTML Sanitization

### innerHTML Prop

When you use the `innerHTML` prop, Pyreon automatically sanitizes the content before inserting it into the DOM:

```tsx
// Sanitized — script tags and event handlers are stripped
<div innerHTML={userContent} />
```

The sanitization pipeline:

1. **Custom sanitizer** (if set via `setSanitizer()`) — highest priority
2. **Browser Sanitizer API** (Chrome 105+) — uses the native `Sanitizer.sanitizeFor()`
3. **Built-in allowlist sanitizer** — DOM-based fallback for older browsers
4. **Tag stripping** — SSR fallback when no DOM is available

### dangerouslySetInnerHTML

For intentionally raw HTML (same API as React), use `dangerouslySetInnerHTML`. This bypasses all sanitization — you are responsible for sanitizing the content:

```tsx
// NOT sanitized — you own the content
<div dangerouslySetInnerHTML={{ __html: trustedHtml }} />
```

In development mode, Pyreon logs a warning when `dangerouslySetInnerHTML` is used.

### sanitizeHtml()

The sanitization function is exported for direct use:

```ts
import { sanitizeHtml } from "@pyreon/runtime-dom"

const safe = sanitizeHtml(untrustedHtml)
```

### setSanitizer()

Override the default sanitizer with a library like DOMPurify:

```ts
import { setSanitizer } from "@pyreon/runtime-dom"
import DOMPurify from "dompurify"

setSanitizer((html) => DOMPurify.sanitize(html))
```

Or with `sanitize-html`:

```ts
import sanitize from "sanitize-html"
setSanitizer((html) => sanitize(html))
```

Reset to the built-in sanitizer:

```ts
setSanitizer(null)
```

### Built-in Allowlist

The fallback sanitizer allows safe HTML tags and strips everything else:

**Allowed tags:** `a`, `abbr`, `address`, `article`, `aside`, `b`, `bdi`, `bdo`, `blockquote`, `br`, `caption`, `cite`, `code`, `col`, `colgroup`, `dd`, `del`, `details`, `dfn`, `div`, `dl`, `dt`, `em`, `figcaption`, `figure`, `footer`, `h1`–`h6`, `header`, `hr`, `i`, `ins`, `kbd`, `li`, `main`, `mark`, `nav`, `ol`, `p`, `pre`, `q`, `rp`, `rt`, `ruby`, `s`, `samp`, `section`, `small`, `span`, `strong`, `sub`, `summary`, `sup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `time`, `tr`, `u`, `ul`, `var`, `wbr`

**Stripped:** `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `textarea`, `select`, `button`, `svg`, `math`, and all other elements not in the allowlist.

**Stripped attributes:** All `on*` event handlers (`onclick`, `onerror`, etc.)

**Blocked URLs:** `javascript:` and `data:` URIs in `href`, `src`, `action`, `formaction`, `poster`, `cite`, and `data` attributes.

## URL Injection Prevention

Pyreon blocks `javascript:` and `data:` URIs in URL-bearing attributes:

```tsx
// Blocked — logs a warning in dev mode
<a href="javascript:alert(1)">Click me</a>
<img src="data:text/html,<script>alert(1)</script>" />
<form action="javascript:void(0)">

// Allowed
<a href="/about">About</a>
<a href="https://example.com">External</a>
<img src="/images/logo.png" />
```

Protected attributes: `href`, `src`, `action`, `formaction`, `poster`, `cite`, `data`.

## Event Handler Batching

Event handlers passed via `onXxx` props are wrapped in `batch()` automatically. This ensures multiple signal writes from one handler coalesce into a single DOM update, preventing intermediate states from being rendered.

```tsx
// Both writes happen atomically — no intermediate render
<button onClick={() => {
  name.set("Alice")
  age.set(30)
}}>
  Update
</button>
```

## Custom Directives

Custom directives (`n-*` props) receive the element and a cleanup registration function. They should not bypass DOM APIs in unsafe ways:

```tsx
// Safe directive pattern
const nAutoFocus: Directive = (el) => {
  el.focus()
}

<input n-autoFocus={nAutoFocus} />
```

## Best Practices

1. **Prefer `innerHTML` over `dangerouslySetInnerHTML`.** The `innerHTML` prop is sanitized automatically.

2. **Set a custom sanitizer for production.** The built-in allowlist is reasonable, but a battle-tested library like DOMPurify provides stronger guarantees:

   ```ts
   import DOMPurify from "dompurify"
   setSanitizer((html) => DOMPurify.sanitize(html))
   ```

3. **Validate user input at the boundary.** Sanitization is a defense-in-depth measure. Always validate and sanitize input on the server before storing it.

4. **Use signals for user input.** Reading signals returns the raw value — Pyreon does not auto-escape signal values in text nodes (they are set via `textContent`, which is inherently safe against XSS).

5. **Be careful with `style` props.** Object-style props are applied via `Object.assign(el.style, ...)`. String-style props use `el.style.cssText`. Neither is sanitized — ensure user input does not control style values that could enable CSS injection.

6. **Island props must be serializable.** Props are JSON-serialized, so they cannot contain executable code. This is a security benefit for island architecture.

## Security Model Summary

| Vector | Protection | Level |
| --- | --- | --- |
| XSS via innerHTML | Automatic sanitization (allowlist + Sanitizer API) | Built-in |
| XSS via text content | `textContent` assignment (inherently safe) | Built-in |
| XSS via URL attributes | `javascript:`/`data:` URI blocking | Built-in |
| XSS via event handlers | Not applicable (handlers are functions, not strings) | By design |
| XSS via dangerouslySetInnerHTML | Developer responsibility (warning in dev) | Opt-in bypass |
| CSS injection via style | Not sanitized — validate input | Developer responsibility |
