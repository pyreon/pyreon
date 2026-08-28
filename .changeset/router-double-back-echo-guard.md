---
"@pyreon/router": patch
---

A rapid second browser Back landing on the ORIGINAL path is no longer dropped. The popstate echo guard compared the incoming traversal against `currentPath` — which the first (still in-flight) browser navigation had not updated yet — so the second traversal read as an echo and was silently discarded, leaving the router's path/query state diverged from the real URL (stale `currentRoute().query` and search readers) until the next navigation. The guard now compares against the in-flight browser navigation's target (`_pendingBrowserTarget`, identity-guarded on settle), so the second traversal runs the full pipeline and supersedes the first. This is the other half of the race #2885 fixed (the URL-clobber half).
