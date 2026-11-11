import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `migrate_react` tool.
// Unit-level coverage of the migration engine itself lives in the
// compiler package (`migrate.test.ts`); this test pins the JSON-RPC
// wiring: zod accepts the `code` arg, the handler calls
// `migrateReactCode`, and the formatter assembles the
// transformed-code-plus-changelog response.

describe('MCP server — migrate_react tool', () => {
  it('rewrites className → class and reports the change', async () => {
    const { client, close } = await newClient()
    try {
      // `className` is the canonical auto-fixable React-ism — the
      // migrator drops the n and reports it in the changes list.
      const text = await callTool(client, 'migrate_react', {
        code: 'const X = () => <div className="x" />',
      })
      expect(text).toContain('## Migrated Code')
      // The migrated code body uses `class=`, not `className=`. We
      // can't assert text.not.toContain('className') because the
      // change description echoes the original name ("className → class").
      expect(text).toMatch(/<div class="x"\s*\/>/)
      expect(text).toContain('**Changes applied')
      // Each change is rendered as a `- Line N: ...` bullet.
      expect(text).toMatch(/- Line \d+: className/)
    } finally {
      await close()
    }
  })

  it('reports "No changes needed" for already-Pyreon code', async () => {
    const { client, close } = await newClient()
    try {
      // Idiomatic Pyreon snippet — the migrator should find nothing
      // to auto-fix, and the formatter must still emit the section
      // headers + the no-changes message.
      const text = await callTool(client, 'migrate_react', {
        code: `
          import { signal } from '@pyreon/reactivity'
          const X = () => <div class="x" />
        `,
      })
      expect(text).toContain('## Migrated Code')
      expect(text).toContain('**Changes applied (0):**')
      expect(text).toContain('No changes needed.')
    } finally {
      await close()
    }
  })

  it('converts the reported useState counter into a counter that updates (#4287)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'migrate_react', {
        code: `import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return <button title={\`n \${count}\`} onClick={() => setCount(count + 1)}>Count: {count}</button>
}
`,
      })
      expect(text).toContain('const count = signal(0)')
      expect(text).toContain('onClick={() => count.set(count() + 1)}')
      expect(text).toContain('Count: {count()}')
      expect(text).toContain('`n ${count()}`')
      const migrated = text.slice(text.indexOf('```tsx'), text.lastIndexOf('```'))
      expect(migrated).not.toContain('setCount')
      expect(text).not.toContain('Remaining issues')
    } finally {
      await close()
    }
  })

  it('lists what it could not convert under "Remaining issues", and keeps that code', async () => {
    const { client, close } = await newClient()
    try {
      // A read of state at setup level ran on every React render but runs
      // once in Pyreon; `useId` has no automatic conversion. Neither may be
      // silently "migrated".
      const text = await callTool(client, 'migrate_react', {
        code: `
          import { useId, useState } from 'react'
          const X = () => {
            const [items, setItems] = useState([])
            const id = useId()
            if (items.length > 3) console.warn('many')
            return <div id={id}>{items.length}</div>
          }
        `,
      })
      expect(text).toContain('## Migrated Code')
      expect(text).toContain('**Remaining issues (manual fix needed):**')
      expect(text).toMatch(/Line 6: `useId` has no automatic Pyreon conversion/)
      expect(text).toMatch(/Line 7: `items` is read once/)
      expect(text).toContain("import { useId } from 'react'")
      // The leftover React import is also what `validate` still reports.
      expect(text).toMatch(/Line \d+ \[react-import\]/)
    } finally {
      await close()
    }
  })
})
