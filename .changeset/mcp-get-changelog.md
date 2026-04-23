---
"@pyreon/mcp": minor
---

New MCP `get_changelog` tool (T2.5.8). AI agents can fetch recent release notes for any `@pyreon/*` package without scraping `git log` or reading raw markdown. Parses changesets-populated `CHANGELOG.md` files, filters out ceremonial version bumps (pure dependency-update releases), and returns the N most recent substantive versions. Accepts the short slug (`"query"`) or the fully-qualified name (`"@pyreon/query"`). Options: `limit` (default 5), `includeDependencyUpdates` (default false), and `since` (filter to versions strictly newer than a floor — useful when an agent knows the version it was trained against and wants just the delta). Complements the existing `get_pattern` + `get_anti_patterns` proactive-docs trio — `get_changelog` answers "what changed recently" while `get_api` answers "what is it now".
