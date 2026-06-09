// Gap 4 follow-up fixture — @pyreon/feature port v1.
//
// v1 contract: literal `schema: { ... }` map shape only. The full
// CRUD runtime (useList / useById / useCreate / useUpdate / etc.)
// is NOT ported in v1 — those still fall through to tier2 silent-
// drop. v1's deliverable is the SCHEMA STRUCT + module-scope
// const exposing `name` + `initialValues` so downstream code has
// real types to reference.
//
// v2+ deferred (each its own PR):
//   - Zod / Valibot / ArkType schema introspection (Strategy-A)
//   - CRUD runtime hooks
//   - Network-fetcher integration
//   - Validators / form integration

import { defineFeature } from '@pyreon/feature'

export const Todo = defineFeature({
  name: 'todo',
  schema: {
    id: 'string',
    title: 'string',
    done: 'boolean',
    priority: 'number',
  },
})
