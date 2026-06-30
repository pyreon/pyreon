import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/feature',
  title: 'Schema-Driven CRUD',
  tagline: 'Schema-driven CRUD primitives — define once, get queries, forms, tables, and stores',
  description:
    'Schema-driven feature factory for Pyreon. Define a validation schema (Zod / Valibot / ArkType) and an API base path once, and `defineFeature` auto-generates reactive hooks for listing, fetching, searching, creating, updating, deleting, form management, table configuration, and store access. Composes `@pyreon/query`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/store`, and `@pyreon/table` under the hood.',
  category: 'universal',
  longExample: `import { defineFeature } from '@pyreon/feature'
import { signal } from '@pyreon/reactivity'
import { z } from 'zod'

// 1. Define a feature from a validation schema + an API base path.
//    \`schema\` is a real Zod / Valibot / ArkType validator (TValues is
//    inferred from it); \`api\` is the string base path.
const Posts = defineFeature({
  name: 'posts',
  schema: z.object({
    title: z.string().min(1),
    body: z.string(),
    published: z.boolean(),
  }),
  api: '/api/posts',
})

// 2. Use auto-generated hooks in components:

// Paginated list query — data() is a Post[] array.
const ListPage = () => {
  const { data, isLoading } = Posts.useList({ page: 1, pageSize: 20 })
  return <For each={() => data() ?? []} by={(p) => p.id}>
    {(post) => <div>{post.title}</div>}
  </For>
}

// Single item query
const DetailPage = (props: { id: string }) => {
  const { data } = Posts.useById(props.id)
  return <div>{data()?.title}</div>
}

// Search with a reactive signal term (pass the Signal directly)
const SearchPage = () => {
  const term = signal('')
  const { data } = Posts.useSearch(term)
  // term.set('hello') refetches automatically
}

// Create mutation
const CreateForm = () => {
  const create = Posts.useCreate()
  return <button onClick={() => create.mutate({ title: 'New', body: '...', published: false })}>
    {create.isPending() ? 'Creating...' : 'Create'}
  </button>
}

// Edit form — useForm takes an OPTIONS object; returns a @pyreon/form FormState
const EditForm = (props: { id: string }) => {
  const form = Posts.useForm({ mode: 'edit', id: props.id })
  return (
    <form onSubmit={form.handleSubmit}>
      <input {...form.register('title')} />
      <textarea {...form.register('body')} />
      <button disabled={form.isSubmitting()}>Save</button>
    </form>
  )
}

// Table — useTable takes DATA first (array or accessor), then options
const TableView = () => {
  const list = Posts.useList()
  const { table } = Posts.useTable(() => list.data() ?? [], {
    columns: ['title', 'published'],
  })
  // table is a Computed<Table<Post>> — render with flexRender
}

// Global store access — the state lives on the StoreApi's \`.store\`
const View = () => {
  const { store } = Posts.useStore()
  store.items()   // Signal<Post[]> — cached items
  store.loading() // Signal<boolean>
}`,
  features: [
    'defineFeature({ name, schema, api }) — single declaration generates 11 reactive members',
    'schema is a real Zod / Valibot / ArkType validator — TValues is inferred from it for end-to-end type safety',
    'Auto-generated useList, useById, useSearch with @pyreon/query',
    'Auto-generated useCreate, useUpdate, useDelete mutations',
    'Auto-generated useForm (returns a @pyreon/form FormState) with schema validation',
    'Auto-generated useTable with column inference via @pyreon/table',
    'Auto-generated useStore (StoreApi<FeatureStore>) for cached items / selection / loading',
    'reference({ name }) helper for foreign-key relationships in schemas',
  ],
  api: [
    {
      name: 'defineFeature',
      kind: 'function',
      signature: '<T>(config: FeatureConfig<T>) => Feature<T>',
      summary:
        'Define a schema-driven CRUD feature. `config` is `{ name, schema, api, validate?, initialValues?, fetcher? }` — `schema` is a real Zod / Valibot / ArkType validator (duck-typed via `safeParseAsync`; Zod carries `_output` so TValues is inferred), and `api` is the string base path (e.g. `/api/posts`). Returns a Feature object with auto-generated reactive members: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`, `queryKey`, plus `name` / `api` / `schema` / `fields`. Composes @pyreon/query (data fetching), @pyreon/form (FormState), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). REST endpoints are derived from `api`: `GET /` (list), `GET /:id` (item), `POST /` (create), `PUT /:id` (update), `DELETE /:id` (delete).',
      example: `const Posts = defineFeature({
  name: 'posts',
  schema: z.object({
    title: z.string().min(1),
    body: z.string(),
  }),
  api: '/api/posts',
})

Posts.useList({ page: 1, pageSize: 20 }) // data() is Post[]
Posts.useById('123')
Posts.useCreate().mutate({ title: 'Hi', body: '…' })
Posts.useForm({ mode: 'edit', id: '123' })   // returns a FormState
Posts.useTable(() => items() ?? [], { columns: ['title'] })`,
      mistakes: [
        'Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally',
        'Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context',
        'Passing a plain string-map (`{ title: "string" }`) as the schema — `schema` must be a real validator with `safeParseAsync` (a Zod / Valibot / ArkType object such as `z.object({ title: z.string() })`); a non-validator yields no fields and no validation',
        'Passing `api` as an object (`{ baseUrl: "…" }`) — `api` is a plain string base path; there are no per-endpoint override fields (the REST routes are derived from it)',
        'Passing a bare id to useForm — useForm takes an OPTIONS object: `useForm({ mode: "edit", id })` for edit, `useForm()` (or `useForm({ initialValues })`) for create',
        'Passing options as useTable’s first argument — useTable takes the DATA first (`useTable(data, { columns })`), not `useTable({ columns })`',
      ],
      seeAlso: ['reference', 'extractFields', 'defaultInitialValues'],
    },
    {
      name: 'reference',
      kind: 'function',
      signature: 'reference(target: { name: string }) => ReferenceSchema',
      summary:
        'Mark a schema field as a foreign-key reference to another feature. Pass a Feature object (it has a `name`) or a plain `{ name: "…" }` — NOT a string. Returns a `ReferenceSchema`: a Zod-string-compatible marker (`safeParse` / `safeParseAsync` accept string or number ids, reject everything else) carrying a `Symbol.for(...)` tag invisible to `JSON.stringify` but detected by `isReference()` and `extractFields()`. Use it for the id-bearing field of a relationship; the generated form / table hooks can then render reference-aware UI.',
      example: `const Users = defineFeature({
  name: 'users',
  schema: z.object({ name: z.string() }),
  api: '/api/users',
})

const authorRef = reference(Users)            // FK to the users feature
authorRef.safeParse('user-42').success         // true (string id)
reference({ name: 'categories' })             // or pass a plain { name }`,
      mistakes: [
        'Passing a plain string instead of a Feature ref — `reference("users")` will not typecheck; pass the Feature object or `{ name: "users" }`.',
        'Forgetting that the referenced Feature must ALSO be defined via defineFeature — the FK only works end-to-end when both sides are real Features sharing the same QueryClient.',
        "Expecting reference() to enforce schema validation at the foreign side — it only marks the field. Cascade behaviour (deleting a user → orphaning posts) is the consumer's concern.",
      ],
      seeAlso: ['defineFeature', 'isReference'],
    },
    {
      name: 'isReference',
      kind: 'function',
      signature: 'isReference(value: unknown) => value is ReferenceSchema',
      summary:
        'Type-guard that returns true if a value is a ReferenceSchema produced by `reference()`. Used internally by `extractFields` to recognise FK fields, and exposed for consumers building custom form/table renderers that need to special-case reference fields (e.g. render a select dropdown instead of a text input).',
      example: `import { isReference, reference } from '@pyreon/feature'

isReference(reference({ name: 'users' })) // true
isReference(z.string())                    // false — a plain Zod schema
isReference('users')                       // false — a bare string is not a reference`,
      mistakes: [
        'Trying to detect references via `instanceof` — references are symbol-tagged plain objects, not class instances. Always use isReference().',
        "Confusing isReference() with Zod's own type guards — isReference checks ONLY for the Pyreon reference marker, not for arbitrary Zod schemas.",
      ],
      seeAlso: ['reference', 'extractFields'],
    },
    {
      name: 'extractFields',
      kind: 'function',
      signature: 'extractFields(schema: unknown) => FieldInfo[]',
      summary:
        'Introspect a schema object and return an array of `FieldInfo` describing each field (name, type, optional, label, plus enumValues for enums and referenceTo for references). Duck-types both Zod v3 (`._def.shape` callable) and Zod v4 (`._zod.def.shape` direct) without importing Zod. Used internally by `defineFeature` to build the generated form/table; exposed for consumers building custom UI that needs to enumerate schema fields.',
      example: `import { extractFields } from '@pyreon/feature'
import { z } from 'zod'

const schema = z.object({
  title: z.string(),
  views: z.number().optional(),
  status: z.enum(['draft', 'published']),
})

const fields = extractFields(schema)
// [
//   { name: 'title',  type: 'string', optional: false, label: 'Title' },
//   { name: 'views',  type: 'number', optional: true,  label: 'Views' },
//   { name: 'status', type: 'enum',   optional: false, label: 'Status', enumValues: ['draft', 'published'] },
// ]`,
      mistakes: [
        'Calling extractFields on a value that is not a real validator (e.g. a plain `{ title: "string" }` map) — it expects a Zod / Valibot / ArkType shape; a non-validator yields an empty field list.',
        'Expecting field order to match declaration order in ALL JS engines — relies on Object.keys() insertion order, which V8 / SpiderMonkey / JSC all preserve for string keys but is technically engine-specific.',
        'Assuming `label` is derived from a docs comment — labels are derived from the field name via humanize-case (`firstName` → `First Name`). Override by passing a label via your own `FieldInfo`.',
      ],
      seeAlso: ['defaultInitialValues', 'defineFeature'],
    },
    {
      name: 'defaultInitialValues',
      kind: 'function',
      signature: 'defaultInitialValues(fields: FieldInfo[]) => Record<string, unknown>',
      summary:
        'Generate sensible default initial values from extracted field info. Returns `{ stringField: "", numberField: 0, booleanField: false, enumField: <first enumValue>, dateField: "", arrayField: [], objectField: {}, referenceField: null }`. Used by `Posts.useForm()` to seed an empty form in create mode (no `id`). Exposed for consumers building their own form initial-value seeding logic.',
      example: `import { extractFields, defaultInitialValues } from '@pyreon/feature'

const fields = extractFields(zodSchema)
const initial = defaultInitialValues(fields)
// { title: '', views: 0, status: 'draft' }

const form = useForm({ initialValues: initial, ... })`,
      mistakes: [
        "Expecting defaults to come from Zod's `.default()` modifier — defaultInitialValues uses the FIELD TYPE only. Zod-level defaults flow through Zod's own parse, not this helper.",
        'Using these defaults for create-or-update forms — these are CREATE-mode seeds. For edit mode, fetch the existing record and use those values.',
      ],
      seeAlso: ['extractFields', 'defineFeature'],
    },
  ],
  gotchas: [
    'defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work.',
    {
      label: 'Schema is a validator',
      note: 'The schema is a real Zod / Valibot / ArkType validator (duck-typed via `safeParseAsync`), not a string map. TValues — the row type flowing through every generated hook — is inferred from it (Zod via `_output`, ArkType via `infer`). Add a `reference({ name })` field for a foreign key.',
    },
    {
      label: 'API base path',
      note: 'The `api` field is a plain string base path (e.g. `/api/posts`). REST endpoints are derived from it — `GET /` (list), `GET /:id` (item), `POST /` (create), `PUT /:id` (update), `DELETE /:id` (delete). There are no per-endpoint override fields; supply a custom `fetcher` for non-conventional transport.',
    },
    {
      label: 'Hook return shapes',
      note: '`useList` / `useById` / `useSearch` return @pyreon/query results (`data` is a Signal — `useList`’s is `T[]`). `useCreate` / `useUpdate` / `useDelete` return mutations (`mutate(vars)` + `isPending()`). `useForm(options?)` returns a @pyreon/form `FormState` (`register` / `handleSubmit` / `isSubmitting`). `useTable(data, options?)` returns `{ table, sorting, globalFilter, columns }`. `useStore()` returns a `StoreApi` whose state lives on `.store` (`store.items()` / `store.loading()`).',
    },
  ],
})
