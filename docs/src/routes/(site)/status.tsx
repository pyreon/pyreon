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
  if (!view) return null
  return <ProjectPageView view={view} />
}
