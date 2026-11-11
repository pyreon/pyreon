import { useLoaderData } from '@pyreon/router'
import { loadMigrateGuides, loadMigrateLanding, loadMigrateMeta } from '../../../site/content/pages'
import { loadSvg } from '../../../site/pages/assets'
import { MigrateLandingPage, type MigrateLandingView } from '../../../site/pages/MigratePages'

/** `/migrate` — the landing: steps, tools, the five compat layers, the guides (`content/pages/migrate/_landing.json`). */
export async function loader(): Promise<MigrateLandingView> {
  const [landing, guides, meta, svg] = await Promise.all([
    loadMigrateLanding(),
    loadMigrateGuides(),
    loadMigrateMeta(),
    loadSvg('migrate/landing-steps.svg'),
  ])
  return { landing, guides, meta, svg }
}

export default function MigrateRoute() {
  const view = useLoaderData<MigrateLandingView | undefined>()
  if (!view) return null
  return <MigrateLandingPage view={view} />
}
