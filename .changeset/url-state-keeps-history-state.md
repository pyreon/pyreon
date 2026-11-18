---
'@pyreon/url-state': patch
'@pyreon/zero-content': patch
---

A URL write no longer erases `history.state`. Without a registered router, `useUrlState` replaced the current history entry with `null` state, which wiped `@pyreon/router`'s `__pyreonIdx` stamp in any router app that did not call `setUrlRouter` (for example a Zero island). A replace now keeps the entry's state; a push still starts a new entry. `<Toc>`'s smooth-scroll hash write had the same fault and is fixed the same way.
