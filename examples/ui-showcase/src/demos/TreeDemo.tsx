import { signal } from '@pyreon/reactivity'
import { Tree } from '@pyreon/ui-components'
import type { TreeNode, TreeState } from '@pyreon/ui-primitives'

const fileSystem: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'Button.tsx', label: 'Button.tsx' },
          { id: 'Input.tsx', label: 'Input.tsx' },
          { id: 'Modal.tsx', label: 'Modal.tsx' },
        ],
      },
      {
        id: 'hooks',
        label: 'hooks',
        children: [
          { id: 'useForm.ts', label: 'useForm.ts' },
          { id: 'useAuth.ts', label: 'useAuth.ts' },
        ],
      },
      { id: 'App.tsx', label: 'App.tsx' },
      { id: 'main.tsx', label: 'main.tsx' },
    ],
  },
  {
    id: 'public',
    label: 'public',
    children: [
      { id: 'favicon.ico', label: 'favicon.ico' },
      { id: 'robots.txt', label: 'robots.txt' },
    ],
  },
  { id: 'package.json', label: 'package.json' },
  { id: 'tsconfig.json', label: 'tsconfig.json' },
  { id: 'README.md', label: 'README.md' },
]

const orgChart: TreeNode[] = [
  {
    id: 'ceo',
    label: 'CEO - Sarah',
    children: [
      {
        id: 'cto',
        label: 'CTO - James',
        children: [
          { id: 'eng1', label: 'Lead Engineer - Alice' },
          { id: 'eng2', label: 'Senior Engineer - Bob' },
          { id: 'eng3', label: 'Engineer - Carol' },
        ],
      },
      {
        id: 'cpo',
        label: 'CPO - Maria',
        children: [
          { id: 'pm1', label: 'PM - Dave' },
          { id: 'design1', label: 'Designer - Eve' },
        ],
      },
      {
        id: 'cfo',
        label: 'CFO - Tom',
        children: [
          { id: 'acc1', label: 'Accountant - Frank' },
        ],
      },
    ],
  },
]

export function TreeDemo() {
  const selected = signal<string>('')

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Tree</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        Expandable tree view with nested items, selection, and keyboard navigation.
      </p>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">File System Tree</h3>
      <div style="margin-bottom: 24px;">
        <Tree
          {...{
            data: fileSystem,
            defaultExpanded: ['src', 'components'],
            value: selected(),
            onChange: (v: string) => selected.set(v as string),
            children: (state: TreeState) => (
              <div
                style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; max-width: 350px; font-family: monospace;"
                tabIndex={0}
                onKeyDown={state.onKeyDown}
              >
                {state.visibleNodes().map((item) => {
                  const hasChildren = !!(item.node.children?.length)
                  const expanded = state.isExpanded(item.node.id)
                  const isSelected = state.isSelected(item.node.id)
                  return (
                    <div
                      style={`
                        padding: 4px 8px; padding-left: ${item.depth * 20 + 8}px; cursor: pointer; border-radius: 4px; font-size: 13px;
                        display: flex; align-items: center; gap: 6px;
                        background: ${isSelected ? '#eff6ff' : 'transparent'};
                        color: ${isSelected ? '#2563eb' : '#374151'};
                      `}
                      onClick={() => {
                        state.select(item.node.id)
                        if (hasChildren) state.toggleExpand(item.node.id)
                      }}
                    >
                      <span style="width: 16px; text-align: center; font-size: 10px; color: #9ca3af;">
                        {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u00A0'}
                      </span>
                      <span>{hasChildren ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
                      <span>{item.node.label}</span>
                    </div>
                  )
                })}
              </div>
            ),
          } as any}
        />
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Selected: {() => selected() || 'None'}
        </p>
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Organization Chart</h3>
      <div style="margin-bottom: 24px;">
        <Tree
          {...{
            data: orgChart,
            defaultExpanded: ['ceo', 'cto'],
            children: (state: TreeState) => (
              <div
                style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; max-width: 400px;"
                tabIndex={0}
                onKeyDown={state.onKeyDown}
              >
                {state.visibleNodes().map((item) => {
                  const hasChildren = !!(item.node.children?.length)
                  const expanded = state.isExpanded(item.node.id)
                  const isSelected = state.isSelected(item.node.id)
                  return (
                    <div
                      style={`
                        padding: 6px 8px; padding-left: ${item.depth * 24 + 8}px; cursor: pointer; border-radius: 4px; font-size: 14px;
                        display: flex; align-items: center; gap: 8px;
                        background: ${isSelected ? '#f0fdf4' : 'transparent'};
                      `}
                      onClick={() => {
                        state.select(item.node.id)
                        if (hasChildren) state.toggleExpand(item.node.id)
                      }}
                    >
                      <span style="width: 16px; text-align: center; font-size: 10px; color: #9ca3af;">
                        {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u2022'}
                      </span>
                      <span>{item.node.label}</span>
                    </div>
                  )
                })}
              </div>
            ),
          } as any}
        />
      </div>

      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 12px;">Collapsed by Default</h3>
      <div style="margin-bottom: 24px;">
        <Tree
          {...{
            data: fileSystem,
            children: (state: TreeState) => (
              <div
                style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; max-width: 350px; font-family: monospace;"
                tabIndex={0}
                onKeyDown={state.onKeyDown}
              >
                {state.visibleNodes().map((item) => {
                  const hasChildren = !!(item.node.children?.length)
                  const expanded = state.isExpanded(item.node.id)
                  return (
                    <div
                      style={`
                        padding: 4px 8px; padding-left: ${item.depth * 20 + 8}px; cursor: pointer; border-radius: 4px; font-size: 13px;
                        display: flex; align-items: center; gap: 6px;
                      `}
                      onClick={() => { if (hasChildren) state.toggleExpand(item.node.id) }}
                    >
                      <span style="width: 16px; text-align: center; font-size: 10px; color: #9ca3af;">
                        {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u00A0'}
                      </span>
                      <span>{item.node.label}</span>
                    </div>
                  )
                })}
                <p style="font-size: 11px; color: #9ca3af; padding: 8px; text-align: center;">
                  Click folders to expand. Use arrow keys for keyboard navigation.
                </p>
              </div>
            ),
          } as any}
        />
      </div>
    </div>
  )
}
