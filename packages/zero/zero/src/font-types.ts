/**
 * Ambient type declarations for `@pyreon/zero`'s `?font` import query.
 *
 * Shipped + exported so the documented usage type-checks out of the
 * box — no consumer hand-authoring required.
 *
 * Add ONE line to any tsconfig-covered `.d.ts` (e.g. `src/env.d.ts`):
 *   /// <reference types="@pyreon/zero/font-types" />
 *
 * Or via tsconfig.json:
 *   "types": ["@pyreon/zero/font-types"]
 *
 * This file is ambient-only (no top-level import/export) so every
 * `declare module` below is a global module augmentation. The
 * `FontDescriptor` shape is referenced via the package self-ref
 * `import('@pyreon/zero/font-import-plugin')` (resolution-stable in
 * the published layout; re-uses the plugin's own type so the runtime
 * + ambient declaration can never drift).
 */

declare module '*.woff2?font' {
  const font: import('@pyreon/zero/font-import-plugin').FontDescriptor
  export default font
}

declare module '*.woff?font' {
  const font: import('@pyreon/zero/font-import-plugin').FontDescriptor
  export default font
}

declare module '*.ttf?font' {
  const font: import('@pyreon/zero/font-import-plugin').FontDescriptor
  export default font
}

declare module '*.otf?font' {
  const font: import('@pyreon/zero/font-import-plugin').FontDescriptor
  export default font
}

declare module '*.eot?font' {
  const font: import('@pyreon/zero/font-import-plugin').FontDescriptor
  export default font
}
