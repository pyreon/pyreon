import { useLoaderData } from '@pyreon/router'
import { loadProject } from '../../site/content/pages'
import { ProjectPageView, type ProjectView } from '../../site/pages/ProjectPage'

/** `/status` — the "plain" project page (`content/pages/project/status.json`). */
export async function loader(): Promise<ProjectView> {
  const page = await loadProject('status')
  if (!page) throw new Error('[Pyreon] content/pages/project/status.json is missing: run scripts/sync-site-content.ts.')
  return { page }
}

export default function StatusRoute() {
  const view = useLoaderData<ProjectView | undefined>()
  // An accessor, so the page follows its loader data (a client-only cold
  // start fills it in after mount) instead of pinning the first read.
  return () => {
    const current = view()
    return current ? <ProjectPageView view={current} /> : null
  }
}
