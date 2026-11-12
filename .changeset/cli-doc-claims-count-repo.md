---
'@pyreon/cli': patch
---

The doc-claims gate module exports `countRepo(repoRoot)`, the counts its claims are checked against (published packages, manifests, lint rules and categories, MCP tools, docs pages, hook exports, detector codes), so a page that displays them reads the same definition the gate enforces.
