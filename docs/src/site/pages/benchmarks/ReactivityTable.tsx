import { signal } from '@pyreon/reactivity'
import { fill } from '../../content/fill'
import type { BenchmarksPage, BenchmarksTemplate } from '../../content/types-site'
import { el } from '../../kit/bases'
import { KitScope } from '../../kit/scope'
import { DataTable } from '../../kit/table'
import { ToggleChips } from '../../kit/toggles'
import { VerdictNote } from './parts'

/**
 * The reactivity section's engine switcher and its table: a zero island
 * (`islands.ts`, `hydrate: 'visible'`). The server renders the first engine,
 * so the page without JavaScript shows a complete table; the island adopts
 * that markup and the chips switch engines. Props are JSON from the content.
 */
export type ReactivityTableProps = {
  reactivity: BenchmarksPage['reactivity']
  copy: BenchmarksTemplate['reactivity']
}

const Stack = el.config({ name: 'BenchReactivityStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 }).theme(() => ({ minWidth: 0 }))

export default function ReactivityTable(props: ReactivityTableProps) {
  const engines = Object.keys(props.reactivity)
  const engine = signal(engines[0] ?? '')
  const c = props.copy
  return (
    <KitScope>
      <Stack>
        <ToggleChips label={c.control} options={engines.map((e) => ({ value: e, label: e }))} value={() => engine()} onChange={(v) => engine.set(v)} />
        <div aria-live="polite" data-bench-engine={() => engine()}>
          {() => {
            const e = engine()
            return (
              <DataTable
                caption={fill(c.caption, { engine: e })}
                columns={[c.columns.test, c.columns.pyreon, c.columns.preact, c.columns.solid, c.columns.verdict]}
                rows={(props.reactivity[e] ?? []).map(([test, p, preact, solid, v, margin]) => ({
                  key: `${e}:${test}`,
                  cells: [
                    { content: test },
                    { content: p.toLocaleString('en'), num: true, hot: true },
                    { content: preact.toLocaleString('en'), num: true },
                    { content: solid.toLocaleString('en'), num: true },
                    { content: <VerdictNote verdict={v} label={margin} /> },
                  ],
                }))}
              />
            )
          }}
        </div>
      </Stack>
    </KitScope>
  )
}
