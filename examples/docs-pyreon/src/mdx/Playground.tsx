import { DocPlayground } from '../components/DocPlayground'

// ─── <Playground> — re-export for src/mdx convention scan ──────────────
//
// The full CodeMirror-backed playground lives at
// `src/components/DocPlayground.tsx` (it predates the @pyreon/zero-content
// migration). This file is the thin re-export that lets the convention
// scanner pick it up by the name `Playground`, which is what the
// migrated reactivity.md references.

export function Playground(props: {
  title: string
  code: string
  height: number
}) {
  return <DocPlayground {...props} />
}
