/**
 * Subpath entry for `@pyreon/atlas/core`. The build tool derives this entry
 * from the export KEY (`./core` → `src/core.ts`); the actual module lives in
 * the `core/` folder. Kept as a thin re-export so the folder + import path stay
 * cleanly separated.
 */
export * from './core/index'
