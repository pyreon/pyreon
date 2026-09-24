---
'@pyreon/zero': patch
'@pyreon/zero-content': patch
'@pyreon/compiler': patch
---

- `@pyreon/zero` (images): optimized image files are named `<name>-<hash>-<width>.<format>`. They were unhashed while served with year-long `immutable` caching, so a changed image stayed stale in browsers, and two images with the same file name in different folders overwrote each other. Variants now encode concurrently, are cached across builds in `node_modules/.cache/pyreon-zero-images/`, go straight to the bundle instead of through a temp file in the output directory, and widths that clamp to the source width produce one file instead of duplicates. A variant that fails to encode still falls back to the original bytes, but now logs which image and format failed.
- `@pyreon/compiler` / `@pyreon/zero`: route parameters may contain hyphens. `[post-id].tsx` used to be treated as a static segment, so the page was only reachable at the literal URL `/posts/[post-id]`.
- `@pyreon/zero-content`: heading ids keep letters from every script. A CJK heading got an empty id and Czech `Úvod` became `vod`; now they get `入门` and `úvod`. A heading with no letters or digits gets `section` (numbered when repeated) instead of an empty id.
