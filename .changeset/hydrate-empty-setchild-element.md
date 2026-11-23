---
'@pyreon/runtime-dom': patch
---

Hydration keeps the server's nodes for a compiled element whose only content is a fixed value holding elements, such as `<span>{cell}</span>` where `cell` is `<b>n</b>`, an array, a fragment or a component, and the static mix `<span>a{cell}b</span>`. Before, the element and everything under it were re-created with identical content and no report.

If the client renders something different there, the walk reports it and replaces it. A divergent value no longer leaves the server's copy beside the client's, which could happen in a `<For>` row admitted by plan replay. Server content the client does not render is removed and reported in development. Replacing a server element with text of the same characters is now reported as a `tag` mismatch, where it used to pass silently.
