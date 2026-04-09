import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'
import type { WorkflowNodeKind } from './data/types'

/**
 * Styled components for the Flow Editor section.
 *
 * Two-column workspace: the `<Flow>` canvas on the left and a JSON
 * code sidebar on the right. The canvas needs an explicit height for
 * `<Flow>` to size its viewport (Flow uses ResizeObserver but the
 * parent must supply concrete dimensions or the SVG collapses to 0).
 *
 * Custom node card colors are driven by `$kind` transient props so
 * the swatches update without re-mounting the node DOM as the kind
 * is edited.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const FlowPage = styled('div')`
  padding: 24px 32px 48px;
  max-width: 1440px;
`

export const Header = styled('header')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
`

export const HeaderText = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const FlowTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const FlowLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Toolbar ─────────────────────────────────────────────────────────
export const Toolbar = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`

export const ToolbarGroup = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[50]};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const ToolbarButton = styled('button')`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[700]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.base[100]};
    border-color: ${(p) => t(p).color.system.primary[300]};
    color: ${(p) => t(p).color.system.primary.text};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export const PrimaryButton = styled('button')`
  padding: 6px 14px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: 1px solid ${(p) => t(p).color.system.primary[400]};
  background: ${(p) => t(p).color.system.primary[500]};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[600]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Two-column workspace ────────────────────────────────────────────
export const Workspace = styled('div')`
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 16px;
  align-items: stretch;
  height: 640px;
`

export const CanvasFrame = styled('div')`
  position: relative;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  overflow: hidden;
  min-height: 0;
`

// ─── Sidebar ─────────────────────────────────────────────────────────
export const SidebarColumn = styled('aside')`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
`

export const SidebarLabel = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[400]};
`

/** Holds the CodeMirror instance — must have a fixed height. */
export const SidebarEditorFrame = styled('div')`
  flex: 1;
  min-height: 0;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  overflow: hidden;
  background: ${(p) => t(p).color.system.light.base};

  & .pyreon-code-editor {
    height: 100%;
  }

  & .cm-editor {
    height: 100%;
    font-size: 12px;
  }

  & .cm-scroller {
    font-family: ${(p) => t(p).fontFamily.mono};
  }
`

export const ParseError = styled('div')`
  padding: 8px 12px;
  background: ${(p) => t(p).color.system.error[50]};
  border: 1px solid ${(p) => t(p).color.system.error[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-size: 11px;
  font-family: ${(p) => t(p).fontFamily.mono};
  color: ${(p) => t(p).color.system.error.text};
`

export const ParseOk = styled('div')`
  padding: 6px 12px;
  background: ${(p) => t(p).color.system.success[50]};
  border: 1px solid ${(p) => t(p).color.system.success[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-size: 11px;
  font-family: ${(p) => t(p).fontFamily.mono};
  color: ${(p) => t(p).color.system.success.text};
`

// ─── Custom workflow node card (rendered inside <Flow>) ──────────────
const KIND_COLORS: Record<WorkflowNodeKind, { bg: string; border: string; accent: string }> = {
  trigger: { bg: '#eef2ff', border: '#6366f1', accent: '#4338ca' },
  filter: { bg: '#fff7ed', border: '#f97316', accent: '#c2410c' },
  transform: { bg: '#f0fdf4', border: '#22c55e', accent: '#15803d' },
  notify: { bg: '#fef2f2', border: '#ef4444', accent: '#b91c1c' },
}

export const NodeCard = styled('div')<{ $kind: WorkflowNodeKind; $selected: boolean }>`
  min-width: 180px;
  padding: 10px 14px;
  background: ${(p) => KIND_COLORS[p.$kind].bg};
  border: 2px solid
    ${(p) => (p.$selected ? KIND_COLORS[p.$kind].accent : KIND_COLORS[p.$kind].border)};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  box-shadow: ${(p) => (p.$selected ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.05)')};
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`

export const NodeKindLabel = styled('div')<{ $kind: WorkflowNodeKind }>`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => KIND_COLORS[p.$kind].accent};
`

export const NodeLabel = styled('div')`
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const NodeConfig = styled('div')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[500]};
  font-family: ${(p) => t(p).fontFamily.mono};
`

// ─── Hint footer ─────────────────────────────────────────────────────
export const HintFooter = styled('div')`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  padding: 8px 12px;
  background: ${(p) => t(p).color.system.base[50]};
  border: 1px solid ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[500]};
  flex-wrap: wrap;
`

export const HintItem = styled('span')`
  display: inline-flex;
  align-items: center;
  gap: 4px;

  & strong {
    color: ${(p) => t(p).color.system.dark[700]};
    font-weight: ${(p) => t(p).fontWeight.semibold};
  }
`

export { Card }
