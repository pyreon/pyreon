---
'@pyreon/runtime-dom': patch
---

An async component whose body resolves after `hydrateRoot` returns now adopts the server DOM of the compiled templates it builds after its `await`, instead of replacing every one of them with an identical new element. Template building stays deferred until the component's resolved output has been hydrated (released on rejection and on unmount too). Seen on the `@pyreon/zero-content` blog index, whose header and empty state were re-created on hydration.
