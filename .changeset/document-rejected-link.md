---
'@pyreon/document': patch
---

A `Link` or `Button` whose `href` the URL allowlist rejects (`javascript:` and similar) now renders its label without a link in every format. The HTML renderer emitted `<a href="">` (which reloads the page when clicked); email, SVG and DOCX emitted an empty link the same way; and PPTX threw, failing the whole render.
