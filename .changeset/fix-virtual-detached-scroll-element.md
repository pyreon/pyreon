---
"@pyreon/virtual": patch
---

`useVirtualizer` / `useWindowVirtualizer` no longer render zero rows when the scroll element is still detached from the document at mount. Pyreon builds a template into an inert fragment and inserts it after `onMount` has run (the routed-page case); there `ownerDocument.defaultView` is `null`, so TanStack attached no ResizeObserver or scroll listener, the scroll rect stayed 0×0 and only `totalSize` was right. The hook now re-attaches once the element is connected (microtask, then frame by frame for a bounded time), and warns in dev if it never is.
