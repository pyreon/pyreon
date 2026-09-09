---
'@pyreon/toast': minor
---

The auto-dismiss countdown is held by three independent sources, and a hidden tab no longer burns it

`<Toaster>` suspended the clock on hover and on keyboard focus through a single
shared flag, so the two defeated each other: a keyboard user tabbing into a
toast (`focusin` → paused) lost it the moment the pointer swept across the stack
and off again (`mouseleave` → resumed), and the toast dismissed itself out from
under the reader. Holds are now taken and released BY IDENTITY — `hover`,
`focus`, `hidden` — and the clock only restarts once the last holder lets go.

Identity rather than a depth counter, because takes and releases are not
reliably balanced: a browser need not fire `focusout` when the focused element
is removed, which an auto-dismiss does routinely. A counter left above zero
freezes every later toast for the life of the page; a stranded `'focus'` hold is
cleared by the next `focusout`.

The third source is new: a backgrounded tab no longer counts down. A four-second
toast is four seconds of ATTENTION, not of wall clock, so one raised just before
the user switches tabs is still there when they come back — matching sonner and
react-hot-toast. A Toaster that mounts into an already-hidden tab starts
suspended, and unmounting while hidden releases the hold rather than stranding it.
