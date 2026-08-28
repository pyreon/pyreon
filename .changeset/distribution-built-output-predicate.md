---
'@pyreon/cli': minor
---

`pyreon doctor`'s distribution gate now names an unbuilt checkout correctly when
the package ships an ambient declaration under `src/`.

The gate discriminates two causes of "no source maps in the tarball" — a real
`files`-array defect, and a checkout that was simply never built — because they
need opposite fixes. It decided by asking whether the tarball contained any
`.js`/`.d.ts`, but a `.d.ts` is indistinguishable by extension from hand-written
source, and 19 published packages ship exactly that (`src/env.d.ts`,
`src/sharp.d.ts`, `src/vite-raw.d.ts`) while listing `src` in `files`. One
authored file answered "yes, this was built", so an unbuilt checkout got the
files-array message the discriminator exists to stop printing.

Built output is now JS, plus declarations outside `src/` — so a types-only build
(`lib/index.d.ts`) still reports as a real defect.
