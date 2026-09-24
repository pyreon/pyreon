---
'@pyreon/runtime-dom': patch
---

Two hydration-recovery fixes, both in the "dead server DOM" class.

**A tag mismatch now recovers at the CURSOR, not at the parent anchor.** For
an element's children the anchor is the END of the list, so a mismatch in the
middle appended the client's node past every following sibling — the client's
own nodes came out in the wrong order, and the dead server copy sat in FRONT of
the live one, which is what makes `querySelector` return a node with no
handlers on it. The text paths already carried this fix; the element path did
not. The client's nodes are now contiguous and in the client's order at the
position the walk reached.

**A `<For>` whose SSR block markers cannot be parsed now removes the range it
claims.** That branch returns a null cursor, meaning "I have taken the rest of
this parent" — but it mounted the client's rows and left the server's in place,
so the list rendered TWICE, live copy first and dead copy after. Snapshotting
before the mount (the ordering the reactive-range sweep already documents) and
removing afterwards leaves exactly the client's rows.

An unclaimed server node after a text mismatch in a static child list is still
not swept: that list has no marker range delimiting its extent, and inferring
one from the leftover cursor is not sound — measured, it deletes
`dangerouslySetInnerHTML` content and breaks the SSR↔hydrate parity fuzz on 5
of 300 seeds. Closing it needs explicit claim accounting; the gap and its
consequence are pinned by the specs in `hydrate-mismatch-recovery.test.tsx`.
