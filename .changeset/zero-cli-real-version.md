---
"@pyreon/zero-cli": patch
---

fix(zero-cli): `zero --version` reports the real package version (was hardcoded `0.0.1`)

`cli.version('0.0.1')` was a frozen literal from inception. It now derives
from `package.json` (`import … with { type: 'json' }`), the same pattern as
`@pyreon/mcp`, so it can never drift again.
