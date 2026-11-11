import { useLoaderData } from '@pyreon/router'
import releases from 'virtual:pyreon-site-releases'
import { loadProject } from '../../site/content/pages'
import { ProjectPageView, type ProjectView } from '../../site/pages/ProjectPage'

/** `/releases` — the "plain" project page (`content/pages/project/releases.json`), with the release history read from the repository at build time (vite-plugins/site-releases.ts). */
export async function loader(): Promise<ProjectView> {
  const page = await loadProject('releases')
  if (!page) throw new Error('[Pyreon] content/pages/project/releases.json is missing: run scripts/sync-site-pages.ts.')
  return { page, releases }
}

export default function ReleasesRoute() {
  const view = useLoaderData<ProjectView | undefined>()
  if (!view) return null
  return <ProjectPageView view={view} />
}
