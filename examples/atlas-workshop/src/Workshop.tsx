/**
 * The Atlas Workshop example — a thin consumer of the standalone `<Workbench>`
 * from `@pyreon/atlas/ui`. Everything workbench-related lives in the package;
 * this example only supplies a catalog of components to showcase (see
 * `./demo-catalog`). A real project would generate its catalog from discovered
 * components via the `atlas dev` CLI.
 */
import { Workbench } from '@pyreon/atlas/ui'
import { demoCatalog } from './demo-catalog'

export function Workshop() {
  return <Workbench catalog={demoCatalog} subtitle="workshop · v0.1" />
}
