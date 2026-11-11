import { notFound, useLoaderData } from '@pyreon/router'
import type { LoaderContext } from '@pyreon/zero'
import type { GetStaticPaths } from '@pyreon/zero/server'
import { loadMigrateLayer, loadMigrateMeta, MIGRATE_IDS } from '../../../site/content/pages'
import { loadSvg } from '../../../site/pages/assets'
import { MigrateLayerPage, type MigrateLayerView } from '../../../site/pages/MigratePages'

/** `/migrate/<framework>` — one prerendered page per compat layer (`content/pages/migrate/<id>.json`). */
export const getStaticPaths: GetStaticPaths<{ id: string }> = () => MIGRATE_IDS.map((id) => ({ params: { id } }))

export async function loader({ params }: LoaderContext): Promise<MigrateLayerView> {
  const id = params.id ?? ''
  const [layer, meta, svg] = await Promise.all([loadMigrateLayer(id), loadMigrateMeta(), loadSvg(`migrate/${id}.svg`)])
  if (!layer) notFound()
  return { layer: layer as MigrateLayerView['layer'], meta, svg, productHref: meta.productHref }
}

export default function MigrateLayerRoute() {
  const view = useLoaderData<MigrateLayerView | undefined>()
  if (!view) return null
  return <MigrateLayerPage view={view} />
}
