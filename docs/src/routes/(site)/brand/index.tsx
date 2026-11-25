import { useLoaderData } from '@pyreon/router'
import { loadProject } from '../../../site/content/pages'
import { ProjectPageView, type ProjectView } from '../../../site/pages/ProjectPage'

/** `/brand` — marks, colour, type and usage (`content/pages/project/brand.json`), the logo pack and brand images. The kit gallery lives at `/brand/kit`. */
export async function loader(): Promise<ProjectView> {
  const page = await loadProject('brand')
  if (!page) throw new Error('[Pyreon] content/pages/project/brand.json is missing: run scripts/sync-site-content.ts.')
  return { page }
}

export default function BrandRoute() {
  const view = useLoaderData<ProjectView | undefined>()
  // An accessor, so the page follows its loader data (a client-only cold
  // start fills it in after mount) instead of pinning the first read.
  return () => {
    const current = view()
    return current ? <ProjectPageView view={current} /> : null
  }
}
