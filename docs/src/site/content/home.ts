import homeJson from './_home.json'
import type { LoopMedia } from '../kit/media'
import type { HomePage, HomeSection } from './types-site'

/**
 * The homepage content (`_home.json`, synced from the content set), typed.
 *
 * `types-site.ts` is the content set's schema, copied verbatim. What the app
 * adds lives here: the hero visual's `media` block (the three-platform loop),
 * which the JSON carries and the schema does not name yet. `_home.check.ts`
 * (written by the sync script) fails the typecheck when the JSON and this
 * type disagree; the code fields arrive highlighted from the build
 * (`vite-plugins/product-content.ts` adds the `…Html` siblings).
 */
type Hero = Extract<HomeSection, { kind: 'hero' }>
export type HomeHero = Omit<Hero, 'visual'> & {
  visual: Hero['visual'] & { media: LoopMedia & { kind: 'video' }; codeHtml?: string }
}
type Once = Extract<HomeSection, { kind: 'once' }>
export type HomeOnce = Omit<Once, 'counter'> & { counter: Once['counter'] & { codeHtml?: string } }
type Ai = Extract<HomeSection, { kind: 'ai' }>
export type HomeAi = Omit<Ai, 'example'> & { example: Ai['example'] & { codeHtml?: string } }

export type HomeSectionData = Exclude<HomeSection, { kind: 'hero' | 'once' | 'ai' }> | HomeHero | HomeOnce | HomeAi
export type HomeData = Omit<HomePage, 'sections'> & { sections: HomeSectionData[] }

export const HOME = homeJson as unknown as HomeData

/** The section of a kind (the page renders them in the JSON's order). */
export type SectionOf<K extends HomeSectionData['kind']> = Extract<HomeSectionData, { kind: K }>
