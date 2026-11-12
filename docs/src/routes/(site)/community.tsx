import { useLoaderData } from '@pyreon/router'
import { loadProject } from '../../site/content/pages'
import { ProjectPageView, type ProjectView } from '../../site/pages/ProjectPage'

/** `/community` — the "plain" project page (`content/pages/project/community.json`). */
export async function loader(): Promise<ProjectView> {
  const page = await loadProject('community')
  if (!page) throw new Error('[Pyreon] content/pages/project/community.json is missing: run scripts/sync-site-content.ts.')
  return { page }
}

export default function CommunityRoute() {
  const view = useLoaderData<ProjectView | undefined>()
  if (!view) return null
  return <ProjectPageView view={view} />
}
