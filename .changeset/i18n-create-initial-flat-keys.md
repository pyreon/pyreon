---
'@pyreon/i18n': patch
---

`createI18n({ messages })` now applies the same flat-key expansion that
`addMessages()` does (W9). Previously, dotted keys in the INITIAL messages
loop were stored verbatim — so `createI18n({ messages: { en: { 'nav.top':
'top' } } })` stored the value un-nested, and `t('nav.top')` split on `.`,
missed, and fell back to returning the key as the value. The bug was
invisible because `addMessages()` (the runtime API called dynamically)
DID nest flat keys; only the canonical initialization shape was broken.

Discovered during the HN-clone walls audit — every `t()` call in the UI
returned its key verbatim. Fixed by calling `nestFlatKeys(dict)` in the
initial-messages loop, matching `addMessages` behavior. Four regression
specs added to `tests/hardening.test.ts` (F6 describe block) covering
flat-only, mixed flat+nested, non-dotted passthrough, and merge-survival
shapes.
