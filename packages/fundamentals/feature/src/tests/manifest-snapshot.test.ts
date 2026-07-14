import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — feature snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/feature — Schema-driven CRUD primitives — define once, get queries, forms, tables, and stores. defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/feature — Schema-Driven CRUD

      Schema-driven feature factory for Pyreon. Define a validation schema (Zod / Valibot / ArkType) and an API base path once, and \`defineFeature\` auto-generates reactive hooks for listing, fetching, searching, creating, updating, deleting, form management, table configuration, and store access. Composes \`@pyreon/query\`, \`@pyreon/form\`, \`@pyreon/validation\`, \`@pyreon/store\`, and \`@pyreon/table\` under the hood.

      \`\`\`typescript
      import { defineFeature } from '@pyreon/feature'
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
      }
      \`\`\`

      > **Note**: defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work.
      >
      > **Schema is a validator — two jobs, different coverage**: The schema is a real validator, not a string map. It drives (1) VALIDATION — works for Zod OR any Standard Schema (Valibot / ArkType / modern Zod / \`s\`), errors routed to the right field; and (2) FIELD INTROSPECTION (auto form fields, table columns, create-form defaults) — Zod-ONLY. With a non-Zod schema, supply \`initialValues\` explicitly (useForm) and build tables via @pyreon/table directly; a one-time dev warning flags the empty-fields case. TValues is inferred from Zod’s \`_output\` / ArkType’s \`infer\`. Add a \`reference({ name })\` field for a foreign key.
      >
      > **API base path**: The \`api\` field is a plain string base path (e.g. \`/api/posts\`). REST endpoints are derived from it — \`GET /\` (list), \`GET /:id\` (item), \`POST /\` (create), \`PUT /:id\` (update), \`DELETE /:id\` (delete). There are no per-endpoint override fields; supply a custom \`fetcher\` for non-conventional transport.
      >
      > **Hook return shapes**: \`useList\` / \`useById\` / \`useSearch\` return @pyreon/query results (\`data\` is a Signal — \`useList\`’s is \`T[]\`). \`useCreate\` / \`useUpdate\` / \`useDelete\` return mutations (\`mutate(vars)\` + \`isPending()\`). \`useForm(options?)\` returns a @pyreon/form \`FormState\` (\`register\` / \`handleSubmit\` / \`isSubmitting\`). \`useTable(data, options?)\` returns \`{ table, sorting, globalFilter, columns }\`. \`useStore()\` returns a \`StoreApi\` whose state lives on \`.store\` (\`store.items()\` / \`store.loading()\`).
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    // 5 entries: defineFeature, reference, isReference, extractFields, defaultInitialValues
    expect(Object.keys(record).length).toBe(5)
  })
})
