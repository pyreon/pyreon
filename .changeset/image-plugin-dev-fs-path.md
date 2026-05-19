---
'@pyreon/zero': patch
---

fix(image-plugin): dev-mode `?optimize` served raw filesystem paths → 404

`loadDevImage` decided the dev URL with `rawPath.startsWith('/') ? rawPath : '/@fs/' + absPath`. Since the build-mode `resolveId` fix made `rawPath` an absolute filesystem path for relative/aliased imports (`/Users/…/img.png`), `startsWith('/')` was `true`, so the browser fetched `http://localhost:5173/Users/…/img.png` → 404 / broken image in `vite dev`. Build mode was unaffected (separate `processImage` path, emits hashed `dist/` assets).

`loadDevImage` now uses the same `existsSync(rawPath)` discriminator the `absPath` derivation already uses: a real on-disk file (relative/aliased import) is routed through Vite's `/@fs/` prefix; only an unresolved `/foo.png`-style public-dir web path is served as-is (Vite serves `public/` at the web root). Bisect-verified regression test added covering both branches.
