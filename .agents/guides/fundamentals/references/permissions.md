# @pyreon/permissions

- `createPermissions(initial?)` returns `can(key, ctx?)`, with `can.not/all/any/assert/set/patch/clear`.
- Wildcards resolve most-specific-first: `'posts.*'` matches exactly one segment, `'posts.**'` any depth below `posts`, `'*'` everything. An exact or `**` deny overrides a broader grant.
- Predicates `(ctx) => boolean` replace a condition DSL.
- `<PermissionsProvider value={can}>`.
