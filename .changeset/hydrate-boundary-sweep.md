---
'@pyreon/runtime-dom': patch
'@pyreon/compiler': patch
---

fix(runtime-dom): sweep the server DOM the client did not claim at the element and root hydration boundaries

Hydration's tag-mismatch recovery deliberately leaves an unmatched server node
for the next sibling to adopt (client `[<b>, <i>]` over server `[<i>]` — the
`<i>` still matches), and documented the other half as "swept at the
element/root boundary, where the extent is known". No such sweep existed:
`hydrateElement` discarded the residual cursor `hydrateChildren` returned, and
`hydrateRoot` did the same with `hydrateChild`.

Seven ordinary divergences therefore left dead DOM on the page — a static text
mismatch beside an element sibling, as last child, or as sole child; a tag
mismatch sole or mid-list; a server-rendered extra trailing element or text
node. `<div><b>a</b><i>a</i></div>` where a cold mount gives
`<div><b>a</b></div>`: visible, countable, and carrying no handler. React and
Vue both delete the extra hydratable nodes.

Both boundaries now remove everything from the residual cursor to the closing
tag / the container's end. Two gates keep it honest. It runs only when the
vnode HAS children, so an adopted `dangerouslySetInnerHTML` payload and a
client-written `innerHTML` are untouched — with no children the cursor is still
the element's first child and "nothing was claimed" is indistinguishable from
"a prop owns this content". And it declines when NOTHING precedes the cursor:
that is not a divergence, it is hydration not having happened (a component that
throws in setup is caught per component and returns an unadvanced cursor), and
leaving the server's markup visible-but-inert beats blanking the page. The static-text mismatch was also aligned with its reactive twin
— replace the stale node and advance — so the following sibling meets the
server node it owns and ADOPTS it instead of having it swept.

`@pyreon/compiler` gains one diagnose-catalog entry for the JSC/Safari spelling
of a missing injected runtime helper (`Can't find variable: _setChild`), whose
page-level symptom under hydration is exactly this class: the throw is caught
per component and the server markup stays on screen, so the page looks rendered
while none of its bindings exist.
