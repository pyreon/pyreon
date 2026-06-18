---
"@pyreon/cli": patch
---

`pyreon doctor` no longer surfaces a scary `Module not found` error when run in a user project. The three monorepo-internal gates — `audit-leak-classes` (default run), `audit-types` and `bundle-budgets` (`--full`) — shell out to scripts that only exist in the Pyreon framework repo; they now **skip gracefully with a clear reason** when those scripts aren't present (any project that isn't the Pyreon monorepo), matching how the `doc-claims` gate already handles its monorepo-only claim sites. Previously every `pyreon doctor` run on a user app reported a spurious `audit-leak-classes/gate-failed` ERROR with a raw `Module not found` message.
