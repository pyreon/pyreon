import type {
  BenchmarksPage,
  ComparePage,
  CompareSite,
  MigrateGuide,
  MigrateLanding,
  MigrateLayer,
  ProjectPage,
  Sitemap,
  WhyPage,
} from './types-site'

/**
 * Loaders for the story, compare, migrate, benchmarks and project pages.
 *
 * `types-site.ts` is the content set's own schema (a verbatim copy). The
 * JSON under `pages/` is that content split one file per page by
 * `scripts/sync-site-content.ts`, so each page loads only its own chunk
 * (`import.meta.glob`, lazy) the way product pages do. The build plugin
 * `vite-plugins/site-pages-content.ts` has added a `codeHtml` sibling (Shiki,
 * both themes) to every object with a `code` string; read it with `htmlOf`.
 *
 * The ids a route prerenders are the files present, so dropping a page from
 * the content set drops its route.
 */
type Loader<T> = () => Promise<T>

const idOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.json'.length)

function family<T>(files: Record<string, Loader<T>>): { ids: readonly string[]; load: (id: string) => Promise<T | undefined> } {
  const map = new Map(Object.entries(files).map(([path, load]) => [idOf(path), load]))
  return {
    ids: [...map.keys()].sort(),
    load: async (id) => {
      const load = map.get(id)
      return load ? load() : undefined
    },
  }
}

const why = family(import.meta.glob<WhyPage>(['./pages/why/*.json', '!./pages/why/_*.json'], { import: 'default' }))
const compare = family(import.meta.glob<ComparePage>(['./pages/compare/*.json', '!./pages/compare/_*.json'], { import: 'default' }))
const migrate = family(import.meta.glob<MigrateLayer>(['./pages/migrate/*.json', '!./pages/migrate/_*.json'], { import: 'default' }))
const project = family(import.meta.glob<ProjectPage>('./pages/project/*.json', { import: 'default' }))

export const WHY_IDS = why.ids
export const COMPARE_IDS = compare.ids
export const MIGRATE_IDS = migrate.ids
export const PROJECT_IDS = project.ids

export const loadWhy = why.load
export const loadCompare = compare.load
export const loadMigrateLayer = migrate.load
export const loadProject = project.load

export type CompareMeta = Omit<CompareSite, 'pages'>
export const loadCompareMeta = async (): Promise<CompareMeta> =>
  (await import('./pages/compare/_meta.json')).default as CompareMeta

export interface WhyMeta {
  order: { id: string; title: string }[]
}
export const loadWhyMeta = async (): Promise<WhyMeta> => (await import('./pages/why/_meta.json')).default as WhyMeta

export interface MigrateMeta {
  productHref: string
  order: { id: string; name: string; package: string }[]
}
export const loadMigrateMeta = async (): Promise<MigrateMeta> => (await import('./pages/migrate/_meta.json')).default as MigrateMeta

export const loadMigrateLanding = async (): Promise<MigrateLanding> =>
  (await import('./pages/migrate/_landing.json')).default as MigrateLanding

export const loadMigrateGuides = async (): Promise<MigrateGuide[]> =>
  (await import('./pages/migrate/_guides.json')).default as MigrateGuide[]

export const loadBenchmarks = async (): Promise<BenchmarksPage> =>
  (await import('./pages/benchmarks.json')).default as unknown as BenchmarksPage

export const loadSitemap = async (): Promise<Sitemap> => (await import('./pages/_sitemap.json')).default as Sitemap

/** The build-time Shiki HTML the content plugin added beside an object's `code`. */
export function htmlOf(obj: object): string | undefined {
  const html = (obj as { codeHtml?: unknown }).codeHtml
  return typeof html === 'string' ? html : undefined
}
