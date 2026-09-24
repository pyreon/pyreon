---
'@pyreon/runtime-dom': patch
---

**A `<For>` row that renders `null` took the whole list down.** Hiding a row
with `cond ? <Row/> : null` is the ordinary way to filter a list without
filtering the data. The row-mount path probed the render result for a
native-item marker before checking it was a value at all, so one null row threw
inside the `<For>` effect — before any row had been placed. The element rendered
as its two markers and nothing else, and the only trace was an unhandled effect
error in the console. SSR renders the same source correctly, so it was a
guaranteed hydration divergence as well.

**The devtools element picker threw on an event forwarded to `document`.** Its
`mousemove`/`click` listeners are capture-phase and document-level — they sit on
the user's app while it is being debugged — and every drag implementation
forwards pointer movement to `document` once the pointer leaves the handle.
`document` has no box to measure and no tag name, so the picker threw inside the
app's own drag path: the tool breaking the thing it was opened to inspect, in a
way that reads as the app's bug.
