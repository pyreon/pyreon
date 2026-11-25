---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
'@pyreon/core': patch
'@pyreon/kinetic': patch
---

A keyed element is now compiled as one template, with its key on the template item.

- `{rows().map((row) => <tr key={row.id}>…</tr>)}` used to keep every row on `h('tr', { key })`, with one separate template per cell, because a template item had nowhere to keep the key. The row is now one `_tpl` clone, and the key is passed as `_tpl`'s fourth argument (`_tpl(html, bind, 1, row.id)`). The item exposes it as `key`, which is where a VNode's key is read from, so the keyed list reconciler and components that read their children's keys see the same value. The item is built when it is mounted. A keyed `.map()` re-runs its callback for every row on each change, so the rows it keeps are never cloned.
- A `key` on an element nested inside a template no longer stops that template from being used. Nothing reads a nested key: its parent is a DOM element, which never reconciles its children. The key is dropped, which the server render already did.
- These cases still use `h()`: a keyed root with a spread (the spread may carry its own `key`), a string key containing `&`, a key whose expression contains JSX, and a `key` with no value. On the server a keyed root still renders as a VNode (`_ssr` raw HTML has no key), so the server and the client expose the same keys.
- Kinetic's group read a child's key only from a VNode. It now reads `key` from any child, so compiled keyed children are tracked by key instead of by position, and an unkeyed compiled child gets the same dev warning as an unkeyed VNode.
