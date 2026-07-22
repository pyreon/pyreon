---
'@pyreon/zero-cli': patch
---

`zero doctor`: register + forward the `--full` flag so the `audit-types` and
`bundle-budgets` gates (which the tool lists under "enable with --full") are
actually reachable. Previously `zero doctor --full` crashed with an uncaught
`CACError: Unknown option --full`. Also catch cac argv errors so any unknown
option prints a friendly usage hint instead of a raw stack trace.
