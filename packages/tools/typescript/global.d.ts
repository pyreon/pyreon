// Pyreon TypeScript global ambient types for Bun-first projects.
//
// Reference via `/// <reference types="@pyreon/typescript/globals" />` or
// list `@pyreon/typescript/globals` in `compilerOptions.types` in tsconfig.
//
// Why this file exists: the Pyreon toolchain assumes Bun universally
// (per the customConditions: ["bun"] workspace contract), but several
// Bun-specific globals don't ship in `@types/node` or `@types/bun` by
// default — consumers had to write per-call casts like
// `(import.meta as { main?: boolean }).main`. This shim declares them
// once so consumer source typechecks cleanly.

declare global {
  interface ImportMeta {
    /**
     * Bun-specific: `true` when the current module is the entry point
     * invoked from the CLI. Used by tools like `@pyreon/lint` and
     * `@pyreon/zero-cli` to gate `main()` calls.
     *
     * @see https://bun.sh/docs/api/import-meta#import-meta-main
     */
    readonly main?: boolean
  }
}

export {}
