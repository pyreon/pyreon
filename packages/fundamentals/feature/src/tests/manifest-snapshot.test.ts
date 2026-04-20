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

      Schema-driven feature factory for Pyreon. Define a feature schema and API config once, and \`defineFeature\` auto-generates reactive hooks for listing, fetching, searching, creating, updating, deleting, form management, table configuration, and store access. Composes \`@pyreon/query\`, \`@pyreon/form\`, \`@pyreon/validation\`, \`@pyreon/store\`, and \`@pyreon/table\` under the hood.

      \`\`\`typescript
      import { defineFeature, reference } from '@pyreon/feature'

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
      store.loading() // loading state
      \`\`\`

      > **Note**: defineFeature composes 5 packages internally (@pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table). All must be installed, and a QueryClient provider must be mounted in the component tree for the query hooks to work.
      >
      > **Schema is runtime**: The schema object uses runtime string values (\`"string"\`, \`"number"\`, \`"boolean"\`) and \`reference()\` calls — not TypeScript types. TypeScript infers the value types from these runtime markers for end-to-end type safety.
      >
      > **API config**: The \`api.baseUrl\` is the only required API field. Individual endpoint URLs default to RESTful conventions (\`GET /\`, \`GET /:id\`, \`POST /\`, \`PUT /:id\`, \`DELETE /:id\`, \`GET /search\`). Override with \`listUrl\`, \`getUrl\`, etc.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
  })
})
