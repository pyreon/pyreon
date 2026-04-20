import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/feature',
  title: 'Schema-Driven CRUD',
  tagline:
    'Schema-driven CRUD primitives — define once, get queries, forms, tables, and stores',
  description:
    'Schema-driven feature factory for Pyreon. Define a feature schema and API config once, and `defineFeature` auto-generates reactive hooks for listing, fetching, searching, creating, updating, deleting, form management, table configuration, and store access. Composes `@pyreon/query`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/store`, and `@pyreon/table` under the hood.',
  category: 'universal',
  longExample: `import { defineFeature, reference } from '@pyreon/feature'

// 1. Define feature schema + API config
const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    published: 'boolean',
    author: reference('users'),     // foreign key reference
  },
  api: {
    baseUrl: '/api/posts',
    // Optional overrides: listUrl, getUrl, createUrl, updateUrl, deleteUrl, searchUrl
  },
})

// 2. Use auto-generated hooks in components:

// Paginated list query
const ListPage = () => {
  const { data, isLoading } = Posts.useList({ page: 1, limit: 20 })
  return <For each={() => data()?.items ?? []} by={(p) => p.id}>
    {(post) => <div>{post.title}</div>}
  </For>
}

// Single item query
const DetailPage = (props: { id: string }) => {
  const { data } = Posts.useById(props.id)
  return <div>{() => data()?.title}</div>
}

// Search with debounce (via @pyreon/query)
const SearchPage = () => {
  const query = signal('')
  const { data } = Posts.useSearch(() => query())
  // ...
}

// Create mutation
const CreateForm = () => {
  const { mutate, isLoading } = Posts.useCreate()
  return <button onClick={() => mutate({ title: 'New', body: '...', published: false })}>
    {() => isLoading() ? 'Creating...' : 'Create'}
  </button>
}

// Edit form with schema validation (via @pyreon/form + @pyreon/validation)
const EditForm = (props: { id: string }) => {
  const { form, field, submit, isSubmitting } = Posts.useForm(props.id)
  return (
    <form onSubmit={submit}>
      <input {...field('title').register()} />
      <textarea {...field('body').register()} />
      <button disabled={isSubmitting}>Save</button>
    </form>
  )
}

// Table with sorting/filtering/pagination (via @pyreon/table)
const TableView = () => {
  const { table } = Posts.useTable({ columns: ['title', 'author', 'published'] })
  // table is a Computed<Table<Post>> — render with flexRender
}

// Global store access
const store = Posts.useStore()
store.items()   // cached items
store.loading() // loading state`,
  features: [
    'defineFeature({ name, schema, api }) — single declaration generates 10+ hooks',
    'Auto-generated useList, useById, useSearch with @pyreon/query',
    'Auto-generated useCreate, useUpdate, useDelete mutations',
    'Auto-generated useForm with schema validation via @pyreon/validation',
    'Auto-generated useTable with column inference via @pyreon/table',
    'Auto-generated useStore for global feature state via @pyreon/store',
    'reference() helper for foreign key relationships in schemas',
  ],
  api: [
    {
      name: 'defineFeature',
      kind: 'function',
      signature:
        '<T>(config: FeatureConfig<T>) => Feature<T>',
      summary:
        'Define a schema-driven CRUD feature. Accepts a name, field schema, and API config. Returns a Feature object with auto-generated hooks: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`. Composes @pyreon/query (data fetching), @pyreon/form (form state), @pyreon/validation (schema validation), @pyreon/store (global state), and @pyreon/table (table configuration). Schema field types are inferred for TypeScript autocompletion across all generated hooks.',
      example: `const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    body: 'string',
    author: reference('users'),
  },
  api: { baseUrl: '/api/posts' },
})

Posts.useList({ page: 1 })
Posts.useById('123')
Posts.useCreate()
Posts.useForm('123')
Posts.useTable({ columns: ['title', 'author'] })`,
      mistakes: [
        'Forgetting to install peer dependencies — defineFeature composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table internally',
        'Using defineFeature without a QueryClient provider — useList/useById/useSearch/useCreate/useUpdate/useDelete all depend on @pyreon/query which requires a QueryClient in context',
        'Passing schema field types as TypeScript types instead of string literals — schema values must be runtime strings like `"string"`, `"number"`, `"boolean"`, or `reference("otherFeature")`',
        'Calling useForm without an id for edit mode — pass an id to load existing data, omit it for create mode',
      ],
      seeAlso: ['reference', 'extractFields', 'defaultInitialValues'],
    },
    {
      name: 'reference',
      kind: 'function',
      signature: '(featureName: string) => ReferenceSchema',
      summary:
        'Mark a schema field as a foreign key reference to another feature. Used inside defineFeature schema definitions to establish relationships between features. The generated form and table hooks understand reference fields and can render appropriate UI (select dropdowns, linked displays).',
      example: `const Posts = defineFeature({
  name: 'posts',
  schema: {
    title: 'string',
    author: reference('users'),    // FK to users feature
    category: reference('categories'),
  },
  api: { baseUrl: '/api/posts' },
})`,
      seeAlso: ['defineFeature'],
    },
  ],
  gotchas: [
    'defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work.',
    {
      label: 'Schema is runtime',
      note: 'The schema object uses runtime string values (`"string"`, `"number"`, `"boolean"`) and `reference()` calls — not TypeScript types. TypeScript infers the value types from these runtime markers for end-to-end type safety.',
    },
    {
      label: 'API config',
      note: 'The `api.baseUrl` is the only required API field. Individual endpoint URLs default to RESTful conventions (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`, `GET /search`). Override with `listUrl`, `getUrl`, etc.',
    },
  ],
})
