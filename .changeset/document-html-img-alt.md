---
"@pyreon/document": patch
---

The HTML renderer now always emits an `alt` attribute on `<img>`. Previously `alt` was only included when an image node supplied one, so an image without `alt` produced a bare `<img src=…>` — WCAG-nonconformant (screen readers fall back to announcing the filename). It now defaults to `alt=""`, which correctly marks the image as decorative so assistive tech skips it (matching the email renderer's existing behavior). Images that supply `alt` are unchanged.
