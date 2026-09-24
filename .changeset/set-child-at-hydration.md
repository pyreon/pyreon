---
'@pyreon/runtime-dom': patch
---

fix(runtime-dom): `_setChildAt` duplicated the page on hydration, and rendered "null"

The adoption verifier relaxes an element whose TEMPLATE has a `<!>` as its only
child — it reads that as a sole slot whose SSR markers were elided — and then
skips verifying that element's children. But the compiler routes two shapes to
`_setChildAt` rather than `_mountSlot`:

```jsx
<div><>{rows}</></div>     // fragment wrapper
<div>{null}{rows}</div>    // dropped nothing-rendering sibling
```

because `classifyJsxChild` recurses fragments and drops `{null}` while
`ssrSoleChild` counts both, so the template gets a `<!>` at firstChild while
the slot is NOT sole to SSR. When the value is STATIC, SSR emits no markers
either way — so the verifier's marker re-check cannot separate "sole, elided"
from "static, never applicable", and it adopts.

`_setChildAt` had no hydration path, so it mounted a fresh copy beside the
server's nodes and removed exactly one of them:

```
ssr       <div class="w"><b>a</b><i>b</i></div>
hydrated  <div class="w"><b>a</b><i>b</i><i>b</i></div>
fresh     <div class="w"><b>a</b><i>b</i></div>
```

It now adopts over the parent's child list when the placeholder is a server
node rather than a clone's empty comment — the hydrate-mode counterpart the
catalogued rule requires, since a verifier relaxation on its own duplicates the
page.

Also fixed, found while reproducing it: the non-mountable branch rendered the
literal text `"null"` for a nullish value (`String(null)` handed to
`createTextNode`), where `_setChild` and SSR both render nothing.
