---
'@pyreon/runtime-server': minor
'@pyreon/compiler': patch
---

Security fix: the sanitized `innerHTML` prop no longer emits RAW markup during SSR/SSG/streaming — it now fails loud.

Pyreon ships two innerHTML props: `dangerouslySetInnerHTML` (raw, developer owns sanitization — React semantics) and `innerHTML` (the SANITIZED path — the client auto-sanitizes it via an allowlist sanitizer). The SSR, SSG, and streaming renderers were emitting the `innerHTML` value RAW next to the intentionally-raw `dangerouslySetInnerHTML` branch, so attacker-controlled markup landed in the initial HTML response and executed at parse time — before hydration could re-sanitize it. That is a server-side stored/reflected XSS: a client-side guard shipped without its server twin.

The sanitizer is DOM-based (`DOMParser`) and cannot run in Node, so there is no safe one-line server sanitize (a hand-rolled string HTML sanitizer is mXSS-prone on exactly the SVG foreign-content surface the allowlist supports). The renderers therefore **throw a clear, actionable `[Pyreon]` error** instead of shipping raw markup — a loud failure beats a silent XSS.

**Behavior break** (intentional, security): a server-rendered element with a non-empty sanitized `innerHTML` prop now throws at render time. Remedies, named in the error:

- Untrusted content → render the element in a client-only island / SPA route so `innerHTML` is sanitized in the browser.
- Trusted content, or your own server-safe sanitizer → use `dangerouslySetInnerHTML` (raw by design; pre-sanitize with e.g. DOMPurify+jsdom or sanitize-html).

`dangerouslySetInnerHTML` is unchanged (raw, verbatim emit). Empty `innerHTML` still falls through to children. A follow-up may add a real-parser (parse5/DOM-in-Node) server sanitizer so the prop can emit sanitized instead of throwing. `@pyreon/compiler` gains a `diagnose` catalog entry teaching the new error.
