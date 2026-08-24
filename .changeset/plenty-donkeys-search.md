---
'@pyreon/compiler': patch
'@pyreon/code': patch
'@pyreon/dnd': patch
'@pyreon/query': patch
'@pyreon/rich-text': patch
'@pyreon/sync': patch
'@pyreon/native-compiler': patch
'@pyreon/atlas': patch
'@pyreon/lint': patch
'@pyreon/zero': patch
'@pyreon/zero-cli': patch
'@pyreon/zero-content': patch
---

Update third-party dependencies to their latest compatible releases.

Runtime dependencies that reach consumers: `oxc-parser` / `oxc-transform`
0.144 → 0.147 (`@pyreon/compiler`, `@pyreon/native-compiler`), the CodeMirror 6
family (`@pyreon/code`), TipTap 3.29 → 3.30 (`@pyreon/rich-text`), TanStack
Query 5.101 → 5.102 (`@pyreon/query`), the
pragmatic-drag-and-drop auto-scroll/hitbox companions (`@pyreon/dnd`),
`y-protocols` (`@pyreon/sync`), `oxlint` 1.78 → 1.80 (`@pyreon/lint`), and the
shiki / remark / unist chain (`@pyreon/zero-content`).

No API surface changes. Held deliberately, each for a stated reason: TypeScript
stays capped `<7.0.0` (TS7 removed the classic Compiler API), and
`@changesets/cli` v3, `@atlaskit/pragmatic-drag-and-drop` v3, and `ky` v2 are
majors that need their own PRs.
