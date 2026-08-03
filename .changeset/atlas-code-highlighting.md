---
'@pyreon/atlas': patch
---

Syntax-highlighted code in the workbench docs — the Usage snippet and the Source block render through `@pyreon/code` (read-only) instead of a plain `<pre>`.

Read-only by construction (`editable: false` removes contenteditable entirely, so it is a display surface rather than an editor whose writes are swallowed); gutters, search and minimap are off so a docs block reads as prose. It follows the workbench's own dark/light, wraps long lines, and the Source variant caps its height so a long file scrolls inside CodeMirror's own scroller. The editor is lazily imported — the canvas, the view the workbench opens on, makes zero CodeMirror requests — and falls back to the plain `<pre>` if the chunk never lands.

Also fixes a latent hang in the `atlas` bin: it only called `process.exit` for a NON-ZERO code, so a successful command's exit depended on every embedded subsystem releasing every handle. A command that embeds a dev server closes the browser and the server, and an embedded Vite dep-optimizer can still outlive both — leaving the process idle forever with its work done and its output printed. Success now sets `process.exitCode` (so piped stdout still flushes) with an `unref`ed fallback that force-exits if something is holding the loop open.
