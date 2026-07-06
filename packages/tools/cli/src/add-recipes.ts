/**
 * Setup recipes for `pyreon add`. Hand-authored + kept in the CLI itself (not
 * generated from each package's manifest) on purpose: the manifests aren't
 * shipped in the published packages, and pulling them cross-package would drag
 * heavy deps into the CLI's install. A small, accurate, curated set of the
 * flagship packages is the right trade-off — every entry here is verified
 * against the package's real public API.
 *
 * A package NOT in this registry still installs fine via `pyreon add`; it just
 * prints a generic "see the docs" pointer instead of a tailored recipe.
 */

export interface AddRecipe {
  /** One line: what capability this package adds. */
  summary: string
  /**
   * Root-level provider/setup to add ONCE (near the app root), if the package
   * needs one. `setup` is the construction code; `wrap` shows the JSX wrapper.
   */
  provider?: { setup: string; wrap: string }
  /** A minimal usage snippet (inside a component / module). */
  usage: string
  /** Docs page path on the Pyreon site. */
  docs: string
}

/** Keyed by the FULL package name (`@pyreon/<x>`). */
export const ADD_RECIPES: Record<string, AddRecipe> = {
  '@pyreon/query': {
    summary: 'TanStack Query adapter — server-state caching, mutations, infinite queries.',
    provider: {
      setup: `import { QueryClient, QueryClientProvider } from '@pyreon/query'\nconst queryClient = new QueryClient()`,
      wrap: `<QueryClientProvider client={queryClient}>\n  <App />\n</QueryClientProvider>`,
    },
    usage: `import { useQuery } from '@pyreon/query'\n// options are a FUNCTION so queryKey can read signals + refetch reactively\nconst todos = useQuery(() => ({ queryKey: ['todos', id()], queryFn: fetchTodos }))`,
    docs: '/docs/query',
  },
  '@pyreon/toast': {
    summary: 'Toast notifications — toast() + variants, a11y-labelled <Toaster>.',
    provider: {
      setup: `import { Toaster } from '@pyreon/toast'`,
      wrap: `<>\n  <App />\n  <Toaster />   {/* render once, near the root */}\n</>`,
    },
    usage: `import { toast } from '@pyreon/toast'\ntoast.success('Saved')\ntoast.error('Something went wrong')`,
    docs: '/docs/toast',
  },
  '@pyreon/i18n': {
    summary: 'Reactive i18n — async namespaces, plurals, interpolation, Intl formatters.',
    provider: {
      setup: `import { createI18n, I18nProvider } from '@pyreon/i18n'\nconst i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hello {{name}}' } } })`,
      wrap: `<I18nProvider value={i18n}>\n  <App />\n</I18nProvider>`,
    },
    usage: `import { useI18n } from '@pyreon/i18n'\nconst { t } = useI18n()\nt('hello', { name: 'Ada' })`,
    docs: '/docs/i18n',
  },
  '@pyreon/permissions': {
    summary: 'Reactive permissions — RBAC/ABAC/flags/tiers with wildcard keys.',
    provider: {
      setup: `import { createPermissions, PermissionsProvider } from '@pyreon/permissions'\nconst can = createPermissions({ 'posts.*': true, 'admin.**': (ctx) => ctx.role === 'admin' })`,
      wrap: `<PermissionsProvider value={can}>\n  <App />\n</PermissionsProvider>`,
    },
    usage: `import { usePermissions } from '@pyreon/permissions'\nconst can = usePermissions()\ncan('posts.edit')          // boolean\ncan.assert('admin.users')  // throws if denied`,
    docs: '/docs/permissions',
  },
  '@pyreon/form': {
    summary: 'Signal-based forms — field(), useForm, <Form>/<Submit>, arrays, validation.',
    usage: `import { field, useForm, Form, Submit } from '@pyreon/form'\nconst form = useForm({\n  fields: { email: field('') },\n  onSubmit: (values) => save(values),\n})\n// <Form of={form}> … <Submit /> </Form>`,
    docs: '/docs/form',
  },
  '@pyreon/store': {
    summary: 'Global state — defineStore(id, setup) composition stores (singletons by id).',
    usage: `import { defineStore } from '@pyreon/store'\nimport { signal } from '@pyreon/reactivity'\nexport const useCounter = defineStore('counter', () => {\n  const count = signal(0)\n  return { count, inc: () => count.set(count() + 1) }\n})`,
    docs: '/docs/store',
  },
  '@pyreon/router': {
    summary: 'Client + SSR router — routes, guards, loaders, typed search params.',
    provider: {
      setup: `import { createRouter, RouterProvider, RouterView } from '@pyreon/router'\nconst router = createRouter({ routes: [{ path: '/', component: Home }] })`,
      wrap: `<RouterProvider router={router}>\n  <RouterView />\n</RouterProvider>`,
    },
    usage: `import { useRoute, RouterLink } from '@pyreon/router'\n// <RouterLink to="/about">About</RouterLink>`,
    docs: '/docs/router',
  },
  '@pyreon/head': {
    summary: 'Document <head> management — useHead, HeadProvider, SSR head rendering.',
    provider: {
      setup: `import { HeadProvider } from '@pyreon/head'`,
      wrap: `<HeadProvider>\n  <App />\n</HeadProvider>`,
    },
    usage: `import { useHead } from '@pyreon/head'\nuseHead({ title: 'Dashboard', meta: [{ name: 'description', content: '…' }] })`,
    docs: '/docs/head',
  },
}
