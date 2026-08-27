---
"@pyreon/i18n": patch
---

perf(i18n): hoist the inline-format callback out of the per-`t()` path

Every successful `t()` resolution called `finalize`, which allocated a fresh
`{ format }` options object **and** its arrow closure to hand to `interpolate`
— on every call, including the dominant one where `interpolate` early-returns
for a plain string without `{{…}}` and never invokes `format` at all. On an
i18n-dense render that is two throwaway allocations per `t()`.

The callback depends only on instance-stable state (`formatters`) plus the
active locale, and it runs **only** synchronously within a `t()`, where the
active locale is `locale.peek()` (equal to the `locale()` read at
`resolveTranslation` entry). It is now built **once** at instance setup and
reused; `finalize`'s now-dead `currentLocale` parameter is dropped. Output is
byte-identical.

Adds a regression lock: an inline `{{v, number}}` spec must reflect the ACTIVE
locale after `locale.set('de')` (de-DE grouping `1.234,5`, not the creation-time
`1,234.5`). Bisect-verified: capturing the creation-time locale instead of
`locale.peek()` fails the post-switch assertion.
