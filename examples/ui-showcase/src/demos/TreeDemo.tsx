import { signal } from '@pyreon/reactivity'
import { Title, TreeItem } from '@pyreon/ui-components'
import { TreeBase } from '@pyreon/ui-primitives'
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
        <TreeBase
          data={treeData}
          value={selected()}
          onChange={(v: string | string[]) => selected.set(v as string)}
          defaultExpanded={['src']}
        >
          {(state: TreeState) => (
            <div {...state.treeProps()} onKeyDown={state.onKeyDown} tabIndex={0}>
              {state.visibleNodes().map(({ node, depth }) => (
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
              ))}
            </div>
          )}
        </TreeBase>
      </div>

      <p style="font-size: 13px; color: #6b7280; margin-top: 12px;">
        Selected: {() => selected() || '(none)'}
      </p>
    </div>
  )
}
