---
'@pyreon/runtime-dom': patch
---

Fix three list and hydration defects found by covering the paths a wrong-shaped
list or a stale server page reaches.

**A keyed list that loses a key silently deletes that row.** Classification is
pinned at an accessor's first run, so a list that was fully keyed then is
reconciled by key forever — and every path that does so addresses rows by key,
which makes a keyless vnode invisible to all of them. Losing one key in a
`.map()` deleted exactly that row; losing all of them rendered an empty list.
The keyed reconciler now carries the positional path itself and falls back to it
for any list it cannot key, resuming keyed reconciliation the moment one is
fully keyed again.

**A duplicate key wedged the next reorder.** The position map recorded a
repeated key's LAST index while the cached row belonged to its FIRST, so the
following update computed an already-ordered sequence, moved nothing, and left
the list rendering the previous order. The key sequence is now deduped
first-wins, matching what actually gets mounted.

**A diverged reactive text left the server's copy on the page.** Hydrating
marker-less (older-server) HTML whose text disagrees with the client inserted
the corrected value beside the stale node instead of replacing it. When the next
sibling was an element it never claimed the stale text either, so the page showed
both values and a second copy of the sibling.

**A bound `<input value>` going nullish did the opposite of what it meant.**
The `h()` path reached a generic nullish branch before the `value` dispatch, so
clearing the field called `removeAttribute` — which leaves what the user typed
on screen and wipes `defaultValue`, since the attribute IS the reset default.
The compiled path (`_setValue`) already carried the correct nullish handling;
the two now agree.
