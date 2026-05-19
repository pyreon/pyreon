---
'@pyreon/zero': patch
---

fix(zero): ship the `?optimize` / `?component` / `?raw` ambient types out of the box

`@pyreon/zero` documents `import hero from './x.jpg?optimize'` and exports the exact `ProcessedImage` return type, but shipped no resolvable ambient `declare module` for its custom Vite import queries — so the documented usage failed `tsc --noEmit` for every consumer, each forced to hand-author a `declare module "*?optimize"` and keep it manually in sync with `ProcessedImage` (silent drift). Ecosystem precedent: `vite/client`, `vite-imagetools/client`, `vite-plugin-pwa/client` all ship their query ambients.

Root cause was a **packaging gap, not missing types**: the correct ambient declarations (covering `*.{jpg,jpeg,png,webp,avif}?optimize` → `ProcessedImage`, `*.svg?component` → `ComponentFn`, `*.svg?raw` → `string`) already existed, but there was no `exports["./image-types"]`, so the documented `/// <reference types="@pyreon/zero/image-types" />` could not resolve.

Fix:

- Wire `./image-types` as a real build entry — `{ "bun": "./src/image-types.ts", "import": "./lib/image-types.js", "types": "./lib/types/image-types.d.ts" }` (mirroring `./client`). `vl_rolldown_build` derives a build **entry** from every exports subpath, so the source must be a buildable `src/image-types.ts` — a hand-authored `.d.ts` with no `.ts` failed the zero build with `[UNRESOLVED_ENTRY] src/image-types.ts`. The build compiles it to an empty `lib/image-types.js` and DTS-emits the ambients verbatim to `lib/types/image-types.d.ts` (a real `.d.ts` → always ambient + `moduleDetection`-exempt for consumers).
- `src/image-types.ts` is excluded from zero's own `tsc --noEmit`: the repo tsconfig sets `moduleDetection: force`, which would read `declare module '*.svg?raw'` in a `.ts` as an augmentation of a non-existent module (TS2664). It carries no logic; the emitted `.d.ts` is the contract (covered by the build's DTS emit + the regression test).
- The internal `ProcessedImage` import uses the package self-ref `import('@pyreon/zero/image-plugin')` — resolution-stable in the published layout (resolves through the consumer's `./image-plugin` export to the clean `lib/types` declaration, not the full `src` `.ts`) and re-uses the plugin's own type so the ambient **can never drift**.

Consumers now add one line to any tsconfig-covered `.d.ts`:

```ts
/// <reference types="@pyreon/zero/image-types" />
```

Additive, non-breaking. Packaging regression test added (`image-types-export.test.ts`, 7 specs) pinning the build-entry export shape, the deleted `.d.ts`, exclusion from zero's tsc, every declared query module, and the resolution-stable self-ref.
