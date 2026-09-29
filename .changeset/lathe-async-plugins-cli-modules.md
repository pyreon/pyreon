---
"@pyreon/lathe": minor
---

Plugin hooks may be asynchronous. `setup`, `transformDocument` and `emit` may return a promise. The new `generateAsync()` awaits it; the CLI and the Vite plugin now run it. The pipeline is written once and driven either way, so the output is byte-identical. The determinism check still runs each hook twice, and the second call starts only after the first has settled. A rejection is attributed to the plugin and hook exactly like a throw. `generate()` stays synchronous and refuses a hook's promise, naming the plugin.

`--plugins` on the CLI accepts third-party plugin modules: a path resolved from the working directory, or a package resolved through `node_modules` (honouring `exports` with the `import` condition). The module's default export may be a plugin, an array of plugins, or a function returning either. A name that is neither a built-in nor loadable is a usage error with a did-you-mean.

`lathe init` detects orval and `@hey-api/openapi-ts` set up with no config file, from the flags in a `package.json` script. A script naming a config file (`--config` / `--file`) reads that file instead.
