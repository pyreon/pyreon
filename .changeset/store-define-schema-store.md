---
'@pyreon/store': minor
---

Schema-validated stores move to their own export, `defineSchemaStore(id, { schema, initial, setup? })`. `defineStore(id, setup, options?)` now takes a setup function only, so a plain store's bundle no longer carries schema mode or the `@pyreon/validation` bridge: a one-store app drops from 4.16 to 2.81 KB gz.

Migration: rename `defineStore(id, { schema, … })` to `defineSchemaStore(id, { schema, … })`. The config, the returned `SchemaStoreApi` and every behaviour are unchanged. In dev builds, passing a schema config to `defineStore` throws an error that names `defineSchemaStore`. Schema-mode error messages now start with `[Pyreon] defineSchemaStore:`.
