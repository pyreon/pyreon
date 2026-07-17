import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Title, Tree, TreeItem } from '@pyreon/ui-components'
import type { TreeNode, TreeState } from '@pyreon/ui-primitives'

const treeData: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'Button.tsx' },
          { id: 'input', label: 'Input.tsx' },
          { id: 'card', label: 'Card.tsx' },
        ],
      },
      {
        id: 'hooks',
        label: 'hooks',
        children: [
          { id: 'use-state', label: 'useState.ts' },
          { id: 'use-effect', label: 'useEffect.ts' },
        ],
      },
      { id: 'index', label: 'index.ts' },
      { id: 'app', label: 'App.tsx' },
    ],
  },
  {
    id: 'package',
    label: 'package.json',
  },
  {
    id: 'tsconfig',
    label: 'tsconfig.json',
  },
]

export function TreeDemo() {
  const selected = signal('')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Tree</Title>

      <div style="max-width: 300px;">
        <Tree
          data={treeData}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          defaultExpanded={['src']}
        >
          {(state: TreeState) => (
            <div {...state.treeProps()} onKeyDown={state.onKeyDown} tabIndex={0}>
              {/*
                KEYED <For>, not a reactive accessor and not a bare .map().
                This demo used to use `{() => …map()}`, which subscribed the
                whole list to focused()/selected()/expanded() — so every arrow
                key REMOUNTED the rows and dropped DOM focus to <body>, killing
                keyboard nav after one press. A bare .map() can't react to
                expand/collapse at all. <For by={node.id}> updates membership
                while surviving rows keep their identity, so focus survives.
              */}
              <For each={() => state.visibleNodes()} by={(v) => v.node.id}>
                {({ node, depth }: { node: TreeNode; depth: number }) => (
                  <TreeItem
                    {...state.getItemProps(node.id, depth, !!node.children?.length)}
                    state={state.isSelected(node.id) ? 'selected' : undefined}
                    style={`padding-left: ${12 + depth * 20}px`}
                    onClick={() => {
                      if (node.children?.length) state.toggleExpand(node.id)
                      else state.select(node.id)
                    }}
                    onFocus={() => state.focus(node.id)}
                  >
                    {node.children?.length ? (
                      <span style="margin-right: 4px; font-size: 10px;">
                        {state.isExpanded(node.id) ? '▼' : '▶'}
                      </span>
                    ) : (
                      <span style="margin-right: 4px; font-size: 10px; opacity: 0.3;">•</span>
                    )}
                    {node.label}
                  </TreeItem>
                )}
              </For>
            </div>
          )}
        </Tree>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-top: 12px;">
        Selected: {() => selected() || '(none)'}
      </p>
    </div>
  )
}
