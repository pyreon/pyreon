import { shareImage } from './kit/assets'
import { type PageHeadInput as CoreInput, pageHeadTags as coreTags, usePageHeadWith } from './head-core'

export { SITE_NAME, SITE_ORIGIN, usePageHeadWith } from './head-core'

/** `usePageHead`'s input: `image` defaults to the asset set's share image for `path`. */
export type PageHeadInput = Omit<CoreInput, 'image'> & { image?: CoreInput['image'] | undefined }

/** The tags `usePageHead` writes, as data (exported for the unit test). */
export function pageHeadTags(input: PageHeadInput): ReturnType<typeof coreTags> {
  return coreTags({ ...input, image: input.image ?? shareImage(input.path) })
}

/**
 * Title, description, canonical, Open Graph and Twitter tags for a page: the
 * one head helper every page of the site uses. Call it once in the page
 * component. The tags replace the root layout's defaults by key (the
 * innermost `useHead` wins), so a page sets only what it knows. The share
 * image is the asset set's for `path` (`shareImage`), else the site default.
 *
 * @example
 * usePageHead({ path: '/products/form', title: 'Forms · Pyreon', description: '…' })
 */
export function usePageHead(input: PageHeadInput): void {
  usePageHeadWith({ ...input, image: input.image ?? shareImage(input.path) })
}
