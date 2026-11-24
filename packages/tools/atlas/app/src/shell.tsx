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
 * Imported through Atlas's own PUBLIC subpath (`@pyreon/atlas/ui`, a package
 * self-reference), never `../../src/ui`: the publish strips `src/`, so a
 * relative import into it resolved here and failed in every install
 * (`UNRESOLVED_IMPORT`). Locked by `check-shipped-src-imports` and by
 * `src/build/tests/published-package.test.ts`, which builds from the packed
 * package.
 */
import { onMount } from '@pyreon/core'
import { useRoute, useRouter } from '@pyreon/router'
import { catalog } from 'virtual:atlas/catalog'
import { installComponentHmr } from './hot'
import { title } from 'virtual:atlas/shell'
import { Workbench, type WorkbenchRoute } from '@pyreon/atlas/ui'

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

  // Dev only — a build folds this away with the module it imports. After
  // MOUNT: every router created while the workbench mounts (the preview's own
  // memory router among them) claims the global HMR hook as it is created
  // ("last router wins"), so a boundary installed earlier was overwritten.
  if (import.meta.env.DEV) onMount(() => installComponentHmr())

  return <Workbench catalog={catalog} title={title} route={route} />
}
