---
'@pyreon/router': patch
---

Fix a rapid double-Back silently losing a history entry.

A BROWSER-initiated traversal (popstate/hashchange) has already moved the URL — the browser owns it, and the router's commit is only catching the app up. `commitNavigation` nonetheless ran `syncBrowserUrl(path, replace)` for it, which is redundant in the happy path and actively wrong once a newer traversal has moved the history: the write lands on whatever entry is current NOW, stamping the older navigation's URL onto it.

The observable failure is pressing Back twice quickly. Back #1 starts an async navigate; Back #2 fires while it is still in flight and is dropped by the same-path guard (which compares against a `currentPath` that #1 has not yet updated); #1 then commits and `replaceState`s its URL over the entry the browser had already moved to. The second Back is silently undone.

A browser-initiated commit now writes nothing. Cancellation remains the one case where the router legitimately rewrites a browser-initiated URL, and `handleBrowserNav` already owns that path.
