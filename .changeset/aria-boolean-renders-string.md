---
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

Fix: boolean `aria-*` state attributes now render as the string
`"true"`/`"false"`, not presence-only `""` (a11y bug, framework-wide).

ARIA state/property attributes (`aria-checked`, `aria-selected`,
`aria-expanded`, `aria-disabled`, `aria-pressed`, `aria-hidden`, …) are
string enums — assistive tech does NOT read `aria-checked=""` (the
presence-only output of a boolean) as "true"; it falls back to the
default, so a checked/selected/expanded element was announced as its
opposite. Both renderers (`applyStaticProp` client + `renderPropValue`
SSR) now coerce a boolean `aria-*` value to its literal string, BEFORE
the generic boolean→presence branch, and do so identically so SSR
markup matches client hydration. HTML boolean attrs (`disabled`,
`hidden`, …) keep presence semantics; `data-*` (author-defined) keeps
presence — only `aria-*` booleans coerce.

This is the root-cause fix: `aria-checked={signal()}` (boolean) now
renders correctly everywhere, with no per-call-site changes.
