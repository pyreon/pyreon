---
'@pyreon/zero': patch
---

The build summary now reports how many pages actually prerendered, and says so loudly when some did not.

It used to derive the count by walking `dist` for `.html` files. That is wrong in exactly the case that matters: when a route fails to prerender, its untouched client shell is still on disk, so it counts as a rendered page. A build that rendered four of five printed `○ 5 prerendered pages` and exited 0, while one of those "pages" was a 356-byte empty shell — the failure existed only in a `console.error` scrolled off above and in `dist/_pyreon-ssg-errors.json`, which nothing reads.

The prerender pass now hands its real numbers to the summary, which reports the rendered count and, on failure, a line naming how many failed, where the errors are recorded, and the consequence — those URLs serve an empty page.

Continuing past a failed path is unchanged and deliberate: one bad route should not kill a thousand-page build, which is what `ssg.onPathError` and the errors artifact are for. Reporting it as a success was never part of that bargain.
