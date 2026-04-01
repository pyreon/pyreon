/**
 * Type declarations for image imports processed by @pyreon/zero's imagePlugin.
 *
 * Add to your tsconfig.json:
 *   "types": ["@pyreon/zero/image-types"]
 *
 * Or reference directly:
 *   /// <reference types="@pyreon/zero/image-types" />
 */

declare module '*.jpg?optimize' {
  const image: import('./image-plugin').ProcessedImage
  export default image
}

declare module '*.jpeg?optimize' {
  const image: import('./image-plugin').ProcessedImage
  export default image
}

declare module '*.png?optimize' {
  const image: import('./image-plugin').ProcessedImage
  export default image
}

declare module '*.webp?optimize' {
  const image: import('./image-plugin').ProcessedImage
  export default image
}

declare module '*.avif?optimize' {
  const image: import('./image-plugin').ProcessedImage
  export default image
}

declare module '*.svg?component' {
  import type { ComponentFn } from '@pyreon/core'
  const component: ComponentFn<{
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
