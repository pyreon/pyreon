---
'@pyreon/lint': patch
---

`pyreon/no-eager-import` no longer flags TYPE-ONLY imports of heavy packages. A `import type { EditorInstance } from '@pyreon/code'` is erased before any bundler sees it, so it cannot add initial-bundle weight — and it is precisely how a correctly lazy consumer types the package it `await import()`s, so flagging it steered authors away from the pattern the rule exists to encourage. Covers both `import type {…}` and declarations whose every specifier is inline-`type`; a value import carrying an inline type still reports. Same guard the sibling `no-heavy-import-only-in-handler` already applied.
