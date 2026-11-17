---
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
---

Native routers: a deep link keeps its query string, so `myapp://search?q=cat` opens the page with `useUrlState('q')` set, as the web link does. On iOS a system pop (the back button or the swipe) re-resolves `params` and `query` for the page it returns to. On Android the system Back pops the router's stack instead of leaving the app.
