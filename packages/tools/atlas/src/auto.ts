/**
 * Subpath entry for `@pyreon/atlas/auto`. The build tool derives this entry
 * from the export KEY (`./auto` → `src/auto.ts`); the actual modules live in the
 * `auto/` folder. Thin re-export so the folder + import path stay separated.
 */
export * from './auto/index'
