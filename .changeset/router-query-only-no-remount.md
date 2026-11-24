---
'@pyreon/router': patch
---

A navigation that changes only the query or the hash no longer remounts the route component (#4814). `<RouterView>` now decides whether to remount by the matched route records and their params, not by the full URL, for `push`, `replace`, Back/Forward, nested layouts and tab stacks. The page reads the new query through its `query` prop (now live), `useRoute()` or `useSearchParams()`. A search box written to the URL with `router.replace`, `useSearchParams().set` or `@pyreon/url-state`'s `setUrlRouter` keeps its focus and local state on every keystroke. A programmatic `replace()` that changes only the query also keeps the scroll position and starts no view transition. A param change, or new loader data, still remounts the page.
