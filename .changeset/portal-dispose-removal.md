---
'@pyreon/runtime-dom': patch
---

Fix `<Portal>` leaking its content on unmount. Portal content mounts into a live parent (e.g. `document.body`) that is never removed as a unit, so the mount cleanup left the portaled DOM behind — a modal / toast / tooltip / dropdown stayed in the document forever once its owner unmounted (route change, `<Show>` flip, conditional render). The Portal now brackets its content with markers and removes everything between them on dispose (reactive content that grew after mount included). No effect on portal rendering or event delegation.
