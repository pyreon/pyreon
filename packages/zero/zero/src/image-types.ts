/**
 * Ambient type declarations for the custom image-import queries that
 * `@pyreon/zero`'s `imagePlugin` introduces (`?optimize` / `?component`
 * / `?raw`). Shipped + exported so the documented usage type-checks out
 * of the box — no consumer hand-authoring required.
 *
 * Add ONE line to any tsconfig-covered `.d.ts` (e.g. `src/env.d.ts`):
 *   /// <reference types="@pyreon/zero/image-types" />
 *
 * Or via tsconfig.json:
 *   "types": ["@pyreon/zero/image-types"]
 *
 * This is an ambient-only **script** (no top-level import/export) so
 * every `declare module` below is a global module augmentation. The
 * `ProcessedImage` shape is referenced via the package self-ref
 * `import('@pyreon/zero/image-plugin')` (resolution-stable in the
 * published layout, and re-uses the plugin's own type so it can never
 * drift out of sync).
 */

declare module '*.jpg?optimize' {
  const image: import('@pyreon/zero/image-plugin').ProcessedImage
  export default image
}

declare module '*.jpeg?optimize' {
  const image: import('@pyreon/zero/image-plugin').ProcessedImage
  export default image
}

declare module '*.png?optimize' {
  const image: import('@pyreon/zero/image-plugin').ProcessedImage
  export default image
}

declare module '*.webp?optimize' {
  const image: import('@pyreon/zero/image-plugin').ProcessedImage
  export default image
}

declare module '*.avif?optimize' {
  const image: import('@pyreon/zero/image-plugin').ProcessedImage
  export default image
}

declare module '*.svg?component' {
  const component: import('@pyreon/core').ComponentFn<{
    width?: number
    height?: number
    class?: string
    style?: string
    [key: string]: unknown
  }>
  export default component
}

declare module '*.svg?raw' {
  const svg: string
  export default svg
}
