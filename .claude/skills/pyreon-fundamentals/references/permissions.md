# @pyreon/permissions

- **@pyreon/permissions**: `createPermissions(initial?)` callable as `can(key, ctx?)`; `can.not/all/any/assert/set/patch/clear`. **Wildcards (most-specific-first)**: `'posts.*'` = exactly one segment, `'posts.**'` = any depth below `posts`, `'*'` = everything; an exact/`**` deny overrides a broader grant (CASL `cannot`-over-`can` in flat-key idiom). Predicates `(ctx) => boolean` replace the MongoDB-condition DSL. `<PermissionsProvider value={can}>`.
