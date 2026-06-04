---
'@pyreon/zero-content': minor
---

zero-content PR 4: content collections + zod schema validation + runtime queries + `.pyreon/content-types.d.ts` type emission + `virtual:zero-content/collections` runtime module.

The fourth piece of the markdown-driven Pyreon docs story — adds Astro-style typed queries on top of the markdown→Pyreon JSX pipeline.

Layers shipped:

- **`getCollection<K>(name)` / `getEntry<K, S>(...)` / `getEntries<K>(...)`** runtime queries (`src/runtime.ts`). Read from the plugin-emitted virtual collections registry. Typed via the augmented `CollectionSchemas` interface; ergonomic loose fallback when augmentation isn't present.
- **`content.config.ts` loader** (`src/config-loader.ts`). Discovery walks for `content.config.{ts,mts,js,mjs}` under the Vite root; loads via `ssrLoadModule` for `.ts`, dynamic `import()` for `.js` / `.mjs`. Structural shape validation surfaces missing collections / unknown `type` / missing schema as clear build errors with file labels.
- **Standard Schema frontmatter validation** (`src/schema-validate.ts`). Duck-typed `~standard.validate` interface — works with zod, valibot, arktype, typia, or any spec-compliant validator. Issues are formatted as multi-line `path: message` lines and surface via the plugin's `this.error()` with the file shortname.
- **Type emission** (`src/type-emit/content-types.ts`). Writes `<root>/.pyreon/content-types.d.ts` declaring an augmentation of `CollectionSchemas` with `StandardSchemaV1.InferOutput<typeof ContentConfig.default.collections[K]["schema"]>` — typed `entry.data` flows from the user's zod schema through TypeScript inference.
- **`virtual:zero-content/collections` virtual module** (`src/virtual-collections.ts`). Renders one `import.meta.glob` per collection + a `_setRegistry({...})` call that hands the runtime its registry on module evaluation. Slug derivation matches `deriveSlug` (strips ext + `/index`).
- **Plugin integration** (`src/plugin.ts`). New hooks: `configResolved` (fast-load `.js`/`.mjs` config + emit types); `configureServer` (load `.ts` via Vite's ssrLoadModule); `buildStart` (build-only fallback); `resolveId` + `load` (serve `virtual:zero-content/collections`); `transform` (apply collection schema to frontmatter); `handleHotUpdate` (invalidate collections module on `content.config` change + reload + re-emit types).
- **`@pyreon/zero-content/schema` subpath** — re-exports `StandardSchemaV1.InferOutput` for the generated `.pyreon/content-types.d.ts` to consume.

72 new specs across 4 test files: `runtime.test.ts` (16), `config-loader.test.ts` (16), `schema-validate.test.ts` (18), `virtual-collections.test.ts` (12), plus integration tests in `plugin-collections.test.ts` (10).

333/333 specs passing. 11/11 validate-fast gates. typecheck + lint clean.

Coverage: statements 98.37%, branches 93.14%, functions 97.67%, lines 99.5%. Branches at 93.14% (under the 95% floor); `BELOW_FLOOR_EXEMPTIONS` entry in `scripts/check-coverage.ts` documents the residual gap as plugin lifecycle error paths (configureServer/buildStart synthetic loader failures, HMR reload-error arms) + runtime overload-alternative arms. PR 5-7 will lift this as the docs-pyreon spike (PR 7) exercises more integration paths end-to-end.
