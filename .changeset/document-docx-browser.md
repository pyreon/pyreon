---
'@pyreon/document': patch
---

`render(doc, 'docx')` and `download(doc, 'x.docx')` now work in the browser. The DOCX renderer asked the `docx` library for a Node `Buffer`, which threw "nodebuffer is not supported by this platform" in any browser; it now asks for an `ArrayBuffer`, which every runtime supports. Node output is unchanged.
