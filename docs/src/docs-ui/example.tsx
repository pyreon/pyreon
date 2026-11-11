import { h } from '@pyreon/core'
import { Example, registerExamples } from '@pyreon/zero-content'

/**
 * `<Example file="./examples/…" />` in the docs (an island, `ExampleIsland`):
 * zero-content's `<Example>`, which mounts the real example file near the
 * viewport. The registry is filled here, in the island's own chunk, so a page
 * without examples loads none of it; each example file stays its own lazy
 * chunk. Keys are written relative to `src/` (`./examples/…`), the form the
 * Markdown uses.
 */
const glob = import.meta.glob('../examples/**/*.tsx') as Record<string, () => Promise<unknown>>
registerExamples(Object.fromEntries(Object.entries(glob).map(([key, load]) => [key.replace(/^\.\.\//, './'), load])))

/** The props the Markdown passes (`ExampleProps`, as a JSON-able type for the island). */
type DocsExampleProps = { file: string; share?: string; shareInitial?: string | number | boolean; class?: string; title?: string }

export default function DocsExample(props: DocsExampleProps) {
  return h(Example, props)
}
