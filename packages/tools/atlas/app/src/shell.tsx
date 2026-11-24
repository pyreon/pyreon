/**
 * The workbench, mounted over the derived catalog.
 *
 * Imported RELATIVELY from Atlas's own source (which ships in the package):
 * the scanned project does not declare `@pyreon/atlas`, so a bare self
 * specifier is not guaranteed to resolve from here.
 */
import { catalog } from 'virtual:atlas/catalog'
import { title } from 'virtual:atlas/shell'
import { Workbench } from '../../src/ui'

export default function AtlasShell() {
  return <Workbench catalog={catalog} title={title} />
}
