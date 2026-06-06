---
'@pyreon/zero-content': minor
---

PR-E audit — types correctness. Four items, 12 new bisect-verified specs.

**C5** — Frontmatter JSON Schema now introspects Zod-shaped schemas.
- Pre-fix the emitter always produced a fully permissive schema regardless of what the user wrote in `defineCollection({ schema })`, so IDE autocomplete only suggested `title` / `description` / `sidebar` — never the user's actual fields.
- Now: when the schema looks like `z.object({...})` (has `_def.shape()`), the emitter enumerates top-level keys, maps each Zod type name to a JSON Schema type, unwraps `optional()`/`nullable()`/`default()` for required-vs-optional detection, and emits `additionalProperties: false`. Non-Zod schemas (Valibot/ArkType/Typia) still fall back to the permissive shape; per-validator adapters can land later without touching the call site.

**C6** — Generated `.pyreon/content-types.d.ts` resolves under both `bundler` and `nodenext`.
- Pre-fix used `import type * as ContentConfig from '<rel-path>/content.config'` (extensionless) which broke under `moduleResolution: nodenext` (requires explicit extensions) and didn't work without `allowImportingTsExtensions`.
- Now uses the TYPE-POSITION `typeof import('...')` form which TypeScript resolves at type-check time, so it works under both resolution modes.

**L2** — Emits `.pyreon/tsconfig.json` the user can extend.
- Pre-fix the user had to remember to add `.pyreon/**` to their tsconfig `include` array.
- Now `writeContentTypes` writes both `content-types.d.ts` AND a minimal `tsconfig.json` that includes just the `.d.ts`. Users can `"extends": "./.pyreon/tsconfig.json"` and the generated types flow in automatically.

**L16** — `.pyreon/vscode-settings.json` non-clobber path documented.
- Settings still emit to `.pyreon/vscode-settings.json` (NOT `.vscode/settings.json`) BY DESIGN to avoid clobbering user editor preferences. The JSDoc now spells this out explicitly so it doesn't read as a bug.

Coverage: `_types-correctness.test.ts` (12 new specs spanning `isZodObjectSchema`, `zodTypeNameToJsonSchema`, `zodFieldToJsonSchema`, `buildJsonSchemaFromZod`, `buildSchemaForCollection`, end-to-end `emitFrontmatterSchemas`, `typeof import` shape, `renderPyreonTsconfig`, `writeContentTypes` BOTH-files emission, and L16 non-clobber).

Total: 454 specs pass (was 427).
