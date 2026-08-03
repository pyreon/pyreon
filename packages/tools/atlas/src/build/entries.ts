/**
 * Turning discovered components into catalog ENTRIES — the step `atlas dev` and
 * `atlas build` must agree on exactly.
 *
 * They would otherwise disagree by construction: the filtering lived inline in
 * the dev server, so the static build would have had to restate it. Restating
 * it is the divergence class this repo keeps paying for — the built site would
 * list a component the dev server hides (or hide one it lists), and nobody
 * would think to compare the two. One owner, both callers.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ComponentIntelligence } from '../core'
import type { CatalogEntrySource } from '../dev/catalog-module'

/**
 * Does this source IMPORT the workbench package? Static `import … from`,
 * `export … from`, dynamic `import()` and `require()` specifiers only —
 * never a bare substring, which would count comments and strings as
 * dependencies. A component whose COMMENT merely mentions `@pyreon/atlas`
 * silently vanished from the sidebar under the substring check.
 */
export function importsAtlas(source: string): boolean {
  return /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]@pyreon\/atlas(?:['"/])/.test(source)
}

export interface CollectOptions {
  /** Reads a file's source; injectable so the filtering is testable without a disk. */
  readSource?: (file: string) => string
}

/**
 * Discovered components → catalog entries.
 *
 * Two components are dropped, both deliberately:
 *
 *  - one with NO recorded source, because it cannot be imported and would put a
 *    sidebar entry on the page that blanks the canvas when selected — worse
 *    than not listing it, because an empty canvas reads as "this component
 *    renders nothing";
 *  - one that imports `@pyreon/atlas`, because it is workbench infrastructure.
 *    Cataloguing the component that mounts `<Workbench>` renders a workbench
 *    INSIDE the workbench, with every control, panel and sidebar entry
 *    duplicated. Detected by import rather than by name: whatever it is called,
 *    a component that imports the workbench is part of it.
 */
export function collectEntries(
  root: string,
  components: readonly ComponentIntelligence[],
  options: CollectOptions = {},
): CatalogEntrySource[] {
  const read = options.readSource ?? ((file: string) => readFileSync(file, 'utf8'))

  return components
    .filter((c) => Boolean(c.source))
    .map((component) => ({ component, file: resolve(root, component.source!) }))
    .filter((entry) => {
      try {
        return !importsAtlas(read(entry.file))
      } catch {
        // Unreadable — let it through and fail visibly, not silently.
        return true
      }
    })
}
