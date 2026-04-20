import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — state-tree snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/state-tree — Structured reactive state tree — composable models with snapshots, patches, and middleware. State mutations must go through actions — direct \`.set()\` calls on state signals bypass middleware and patch recording. The model enforces this in dev mode."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/state-tree — State Tree

      MobX-State-Tree-inspired structured state management built on Pyreon signals. Models compose state (signals), views (computeds), and actions into self-contained units that support typed snapshots, JSON-patch record/replay, and action interception middleware. Models can nest other models for tree-shaped state, and \`.asHook(id)\` provides singleton instances scoped to a store-like registry.

      \`\`\`typescript
      import { model, getSnapshot, applySnapshot, onPatch, applyPatch, addMiddleware } from '@pyreon/state-tree'

      // Define a model — state (signals), views (derived), actions (mutations):
      const Todo = model({
        state: { title: '', done: false },
        views: (self) => ({
          summary: () => \`\${self.title()} [\${self.done() ? 'x' : ' '}]\`,
        }),
        actions: (self) => ({
          toggle: () => self.done.set(!self.done()),
          rename: (title: string) => self.title.set(title),
        }),
      })

      const TodoList = model({
        state: { todos: [] as ReturnType<typeof Todo.create>[] },
        actions: (self) => ({
          add: (title: string) => {
            const todo = Todo.create({ title, done: false })
            self.todos.update(list => [...list, todo])
          },
        }),
      })

      // Create instances:
      const list = TodoList.create({ todos: [] })
      list.add('Write tests')
      list.todos()[0].toggle()

      // Snapshots — typed recursive serialization:
      const snap = getSnapshot(list)
      applySnapshot(list, { todos: [{ title: 'Restored', done: true }] })

      // JSON patches — record/replay for undo, sync, debugging:
      const patches: Patch[] = []
      const dispose = onPatch(list, (patch) => patches.push(patch))
      list.add('New item')
      // Later: applyPatch(list, patches[0]) to replay

      // Middleware — intercept any action in the tree:
      addMiddleware(list, (call, next) => {
        console.log(\`Action: \${call.name}\`, call.args)
        return next(call)
      })

      // Singleton hook for app-wide state:
      const useTodoList = TodoList.asHook('todo-list')
      const { store } = useTodoList() // same instance on every call
      \`\`\`

      > **Actions only**: State mutations must go through actions — direct \`.set()\` calls on state signals bypass middleware and patch recording. The model enforces this in dev mode.
      >
      > **Snapshot serialization**: \`getSnapshot\` reads via \`.peek()\` so it does not subscribe to signals. The snapshot is a one-time read, not a reactive computed.
      >
      > **Devtools**: Import \`@pyreon/state-tree/devtools\` for a WeakRef-based registry of live model instances. Tree-shakeable — zero cost unless imported.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(6)
    expect(record['state-tree/model']!.notes).toContain('ModelDefinition')
    expect(record['state-tree/model']!.mistakes?.split('\n').length).toBe(3)
  })
})
