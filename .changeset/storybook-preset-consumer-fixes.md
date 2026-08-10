---
'@pyreon/storybook': patch
---

The framework preset now actually loads for consumers — three bugs, each
sufficient to break every `storybook build`/`dev`, reported from a real
downstream project:

- `lib/preset.js` is ESM (`"type": "module"`) but computed its preview path
  with CJS `__dirname` → `SB_CORE-SERVER_0002 CriticalPresetLoadError` at
  config load. Now `fileURLToPath(new URL('preview', import.meta.url))`,
  scheme-guarded so the module stays total under non-file ESM loaders.
- No builder was exported → `SB_CORE-SERVER_0003 MissingBuilderError` once
  the preset loaded. `core.builder` is now `@storybook/builder-vite`,
  declared as a peer (`>=8.0.0`) so it version-aligns with your storybook.
- The `./preview` subpath carried only `bun`/`import`/`types` conditions, so
  Storybook's CJS preset loader died with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Every subpath now also carries `default`.
