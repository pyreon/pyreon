import { useLoaderData } from '@pyreon/router'
import { loadProject } from '../../../site/content/pages'
import { loadImages } from '../../../site/pages/assets'
import { BRAND_IMAGES, ProjectPageView, type ProjectView } from '../../../site/pages/ProjectPage'

/** `/brand` — marks, colour, type and usage (`content/pages/project/brand.json`), the logo pack and brand images. The kit gallery lives at `/brand/kit`. */
export async function loader(): Promise<ProjectView> {
  const [page, images] = await Promise.all([loadProject('brand'), loadImages([...BRAND_IMAGES.clearSpace, ...BRAND_IMAGES.typeSpecimen])])
  if (!page) throw new Error('[Pyreon] content/pages/project/brand.json is missing: run scripts/sync-site-pages.ts.')
  return { page, images }
}

export default function BrandRoute() {
  const view = useLoaderData<ProjectView | undefined>()
  if (!view) return null
  return <ProjectPageView view={view} />
}
