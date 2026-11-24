/**
 * The workbench, mounted over the derived catalog, with zero's router owning
 * the component URL.
 *
 * The router decides what the URL means: `/` and `/:component` (and a
 * catch-all for anything deeper) under one layout, its `base` from Vite's
 * `BASE_URL`, its trailing slash `add` (each component page is a
 * `<id>/index.html` directory on a static host). The workbench reads the
 * selection from the route params and writes through `router.replace` — it
 * never parses or builds a path itself (see `WorkbenchRoute`).
 *
 * Imported RELATIVELY from Atlas's own source (which ships in the package):
 * the scanned project does not declare `@pyreon/atlas`, so a bare self
 * specifier is not guaranteed to resolve from here.
 */
import { useRoute, useRouter } from '@pyreon/router'
import { catalog } from 'virtual:atlas/catalog'
import { title } from 'virtual:atlas/shell'
import type { WorkbenchRoute } from '../../src/ui'
import { Workbench } from '../../src/ui'

export default function AtlasShell() {
  const router = useRouter()
  const current = useRoute()
  const route: WorkbenchRoute = {
    // `component` is set only by the `/:component` route; the root and the
    // catch-all name no component.
    id: () => current().params.component,
    go: (id, query) => {
      const path = id ? `/${encodeURIComponent(id)}/` : '/'
      void router.replace(query ? `${path}?${query}` : path)
    },
  }

  return <Workbench catalog={catalog} title={title} route={route} />
}
