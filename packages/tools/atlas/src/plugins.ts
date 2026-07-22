/**
 * Subpath entry for `@pyreon/atlas/plugins`. The build tool derives this entry
 * from the export KEY (`./plugins` → `src/plugins.ts`); the actual modules live
 * in the `plugins/` folder. Kept as a thin re-export so the folder + import
 * path stay cleanly separated.
 */
export * from './plugins/index'
