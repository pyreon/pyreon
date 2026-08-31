---
'@pyreon/lint': minor
'@pyreon/create-multiplatform': patch
---

Shared `settings` in the lint config, and the four portable rules a scaffolded multiplatform app was never actually running.

`portablePaths` is a property of the project, not of one rule — it names the directories whose source has to survive three targets, and **five** rules need that same answer. Repeating it per rule made a config a hand-maintained copy of the rule registry, and the multiplatform scaffolder listed exactly one: `no-out-of-subset-construct` fired, while `no-web-only-import-in-portable`, `prefer-canonical-primitive`, `require-native-compat-marker` and `no-css-in-js-in-portable` were silently inert in every scaffolded app.

`{ "settings": { "portablePaths": ["src/"] } }` says it once. A key is seeded into a rule's options only when that rule DECLARES it in `meta.schema`, so a shared key can never reach a rule that would reject it as unknown; per-rule options still win. A `settings` key no rule declares is reported as a config error, since a typo there would otherwise be as silent as a typo'd rule id.

Two fixes fell out of the fixture that proves it:

- `prefer-canonical-primitive` fired on DOM tags inside a `<Web>` branch — the exact shape its own message recommends as the fix. It now tracks `<Web>` by depth, so leaving the subtree re-arms the rule rather than one escape hatch silencing a whole file.
- `no-out-of-subset-construct` read `portablePaths` through its own copy of the parsing logic; all five rules now share one helper, so they cannot drift on what the key means.
