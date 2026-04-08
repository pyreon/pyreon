import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'
import type { ConnectionState } from './connectionMachine'

/**
 * Styled components for the Chat section.
 *
 * Same convention as the rest of the app:
 *   • Raw HTML elements    → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components → extend via the rocketstyle chain
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const ChatLayout = styled('div')`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 0;
  height: calc(100vh - 0px);
  max-height: 720px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  overflow: hidden;
  margin: 32px 40px;
  max-width: 1080px;
`

// ─── Sidebar ─────────────────────────────────────────────────────────
export const ChannelSidebar = styled('aside')`
  background: ${(p) => t(p).color.system.dark[800]};
  color: ${(p) => t(p).color.system.light[800]};
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
`

export const SidebarHeader = styled('div')`
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const SidebarTitle = styled('div')`
  font-size: 14px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.light.base};
`

export const SidebarSubtitle = styled('div')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.light[500]};
`

export const SidebarLabel = styled('div')`
  padding: 0 20px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.light[500]};
`

export const ChannelButton = styled('button')<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 20px;
  font-size: 13px;
  border: none;
  background: ${(p) => (p.$active ? t(p).color.system.light[100] : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.light.base : t(p).color.system.light[700])};
  font-weight: ${(p) => (p.$active ? t(p).fontWeight.semibold : t(p).fontWeight.base)};
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${(p) =>
      p.$active ? t(p).color.system.light[100] : t(p).color.system.light[50]};
  }
`

export const ChannelHash = styled('span')`
  color: ${(p) => t(p).color.system.light[500]};
  margin-right: 4px;
`

export const ChannelMembers = styled('span')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.light[500]};
`

// ─── Header ──────────────────────────────────────────────────────────
export const ChatMain = styled('div')`
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: ${(p) => t(p).color.system.light.base};
  min-height: 0;
`

export const ChatHeader = styled('header')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
  gap: 16px;
`

export const ChatHeaderText = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

export const ChatHeaderTitle = styled('div')`
  font-size: 16px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const ChatHeaderTopic = styled('div')`
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const StatusPill = styled('span')<{ $state: ConnectionState }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'idle':
      case 'failed':
        return theme.color.system.error[100]
      case 'connecting':
      case 'reconnecting':
        return theme.color.system.warning[100]
      case 'connected':
        return theme.color.system.success[100]
    }
  }};
  color: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'idle':
      case 'failed':
        return theme.color.system.error.text
      case 'connecting':
      case 'reconnecting':
        return theme.color.system.warning.text
      case 'connected':
        return theme.color.system.success.text
    }
  }};
`

export const StatusDot = styled('span')<{ $state: ConnectionState }>`
  width: 8px;
  height: 8px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$state) {
      case 'idle':
      case 'failed':
        return theme.color.system.error.base
      case 'connecting':
      case 'reconnecting':
        return theme.color.system.warning.base
      case 'connected':
        return theme.color.system.success.base
    }
  }};
`

// ─── Message scroll area ─────────────────────────────────────────────
export const MessageScroll = styled('div')`
  overflow-y: auto;
  background: ${(p) => t(p).color.system.base[50]};
  min-height: 0;
`

/**
 * Inner spacer for the virtualizer — `--total-h` is set on the JSX
 * site from `virtual.totalSize()` so the styled component class is
 * shared across renders.
 */
export const VirtualInner = styled('div')`
  position: relative;
  width: 100%;
  height: var(--total-h, 0px);
`

/**
 * Single virtualized row container — positioned absolutely via the
 * two CSS variables `--row-h` and `--row-y` written by the route
 * component on each render. Same canonical virtualization pattern as
 * the dashboard's customers list.
 */
export const VirtualRow = styled('div')`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--row-h);
  transform: translateY(var(--row-y));
  padding: 0 24px;
`

export const MessageBubble = styled('div')<{ $own?: boolean; $pending?: boolean }>`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 8px 0;
  opacity: ${(p) => (p.$pending ? 0.6 : 1)};
  flex-direction: ${(p) => (p.$own ? 'row-reverse' : 'row')};
`

export const Avatar = styled('div')<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => p.$color};
  color: ${(p) => t(p).color.system.light.base};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  flex-shrink: 0;
`

export const MessageContent = styled('div')<{ $own?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 70%;
  align-items: ${(p) => (p.$own ? 'flex-end' : 'flex-start')};
`

export const MessageMeta = styled('div')`
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 11px;
`

export const MessageAuthor = styled('span')<{ $color: string }>`
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => p.$color};
`

export const MessageTime = styled('span')`
  color: ${(p) => t(p).color.system.dark[400]};
`

export const MessageBody = styled('div')<{ $own?: boolean }>`
  padding: 8px 12px;
  background: ${(p) =>
    p.$own ? t(p).color.system.primary[100] : t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  font-size: 14px;
  line-height: ${(p) => t(p).lineHeight.base};
  word-wrap: break-word;
`

// ─── Composer ─────────────────────────────────────────────────────────
export const ComposerBar = styled('form')`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid ${(p) => t(p).color.system.base[200]};
  background: ${(p) => t(p).color.system.light.base};
`

export const ComposerInput = styled('input')`
  flex: 1;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px ${(p) => t(p).color.system.primary[100]};
  }

  &::placeholder {
    color: ${(p) => t(p).color.system.dark[400]};
  }

  &:disabled {
    background: ${(p) => t(p).color.system.base[50]};
    cursor: not-allowed;
  }
`

export const SendButton = styled('button')`
  padding: 10px 18px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  cursor: pointer;
  transition: ${(p) => t(p).transition.fast};

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[800]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Empty / loading states ──────────────────────────────────────────
export const StateCard = Card.theme(() => ({
  padding: 32,
  textAlign: 'center',
}))

export const StateText = Paragraph.theme((theme) => ({
  color: theme.color.system.dark[400],
  marginBottom: 0,
}))

// Re-export Title for component-level use
export { Title }
