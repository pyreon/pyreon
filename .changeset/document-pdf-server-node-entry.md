---
'@pyreon/document': patch
---

Server-side PDF rendering no longer fails on documents containing PNG images with pdfmake 0.3.12. That release's browser build decodes PNGs through a Web `Worker`, which Node, Bun and Deno don't have, so `render(doc, 'pdf')` threw `Worker is not defined`. The PDF renderer now loads pdfmake's Node entry on the server and keeps the browser build in browsers.
