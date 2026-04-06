import { signal } from '@pyreon/reactivity'
import {
  Title,
  Paragraph,
  Badge,
  Button,
  Avatar,
  CloseButton,
  Tabs,
  Tab,
  TabPanel,
  Card,
  Divider,
} from '@pyreon/ui-components'

interface NotificationItem {
  id: number
  user: string
  initials: string
  message: string
  time: string
  read: boolean
  archived: boolean
}

const initialNotifications: NotificationItem[] = [
  { id: 1, user: 'Alice Johnson', initials: 'AJ', message: 'Commented on your pull request #142: "Great refactoring, LGTM!"', time: '2 minutes ago', read: false, archived: false },
  { id: 2, user: 'Bob Smith', initials: 'BS', message: 'Invited you to collaborate on Project Atlas.', time: '15 minutes ago', read: false, archived: false },
  { id: 3, user: 'System', initials: 'SY', message: 'Your deployment to production completed successfully.', time: '1 hour ago', read: false, archived: false },
  { id: 4, user: 'Carol White', initials: 'CW', message: 'Mentioned you in a comment: "Can @vit review this?"', time: '2 hours ago', read: true, archived: false },
  { id: 5, user: 'Dave Brown', initials: 'DB', message: 'Assigned you to issue #87: Fix SSR hydration mismatch.', time: '3 hours ago', read: true, archived: false },
  { id: 6, user: 'Eve Davis', initials: 'ED', message: 'Approved your expense report for Q1 2026.', time: '5 hours ago', read: true, archived: true },
  { id: 7, user: 'Frank Miller', initials: 'FM', message: 'Shared a document: "2026 Roadmap Draft" with you.', time: '1 day ago', read: true, archived: true },
  { id: 8, user: 'System', initials: 'SY', message: 'Your SSL certificate will expire in 14 days. Renew now.', time: '2 days ago', read: true, archived: false },
]

export function NotificationCenterDemo() {
  const notifications = signal<NotificationItem[]>(initialNotifications)
  const activeTab = signal('all')

  const unreadCount = () => notifications().filter((n) => !n.read).length
  const allItems = () => notifications().filter((n) => !n.archived)
  const unreadItems = () => notifications().filter((n) => !n.read && !n.archived)
  const archivedItems = () => notifications().filter((n) => n.archived)

  const markAllRead = () => {
    notifications.update((items) => items.map((n) => ({ ...n, read: true })))
  }

  const dismiss = (id: number) => {
    notifications.update((items) => items.filter((n) => n.id !== id))
  }

  const markRead = (id: number) => {
    notifications.update((items) =>
      items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
  }

  const renderNotification = (item: NotificationItem) => (
    <div
      style={`display: flex; gap: 12px; padding: 12px; border-radius: 8px; cursor: pointer; ${!item.read ? 'background: #f0f7ff;' : ''}`}
      onClick={() => markRead(item.id)}
    >
      <div style="flex-shrink: 0;">
        <Avatar {...{ size: 'md' } as any}>{item.initials}</Avatar>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
          <Paragraph {...{ size: 'sm', style: 'font-weight: 600;' } as any}>{item.user}</Paragraph>
          {!item.read && (
            <Badge {...{ state: 'primary', size: 'sm' } as any}>New</Badge>
          )}
        </div>
        <Paragraph {...{ size: 'sm', style: 'color: #4b5563; line-height: 1.4;' } as any}>
          {item.message}
        </Paragraph>
        <Paragraph {...{ size: 'sm', style: 'color: #9ca3af; margin-top: 4px; font-size: 12px;' } as any}>
          {item.time}
        </Paragraph>
      </div>
      <div style="flex-shrink: 0; align-self: flex-start;">
        <CloseButton
          {...{ size: 'sm' } as any}
          onClick={(e: Event) => {
            e.stopPropagation()
            dismiss(item.id)
          }}
        />
      </div>
    </div>
  )

  const renderList = (items: NotificationItem[]) => {
    if (items.length === 0) {
      return (
        <div style="text-align: center; padding: 40px 0;">
          <Paragraph {...{ size: 'sm', style: 'color: #9ca3af;' } as any}>
            No notifications to display.
          </Paragraph>
        </div>
      )
    }
    return (
      <div style="display: flex; flex-direction: column;">
        {items.map((item, i) => (
          <>
            {renderNotification(item)}
            {i < items.length - 1 && <Divider />}
          </>
        ))}
      </div>
    )
  }

  return (
    <div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px;">Notification Center</h2>
      <p style="color: #6b7280; margin-bottom: 24px;">
        A notification list using Tabs, Avatar, Badge, CloseButton, Card, and Divider in a realistic pattern.
      </p>

      <div style="max-width: 600px;">
        <Card {...{ variant: 'elevated' } as any}>
          {/* Header */}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <Title {...{ size: 'h4' } as any}>Notifications</Title>
              {() =>
                unreadCount() > 0 ? (
                  <Badge {...{ state: 'primary', size: 'sm' } as any}>
                    {unreadCount()} unread
                  </Badge>
                ) : null
              }
            </div>
            <Button
              {...{ state: 'secondary', variant: 'ghost', size: 'sm' } as any}
              onClick={markAllRead}
              disabled={unreadCount() === 0}
            >
              Mark all read
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab()} onChange={(v: string) => activeTab.set(v)}>
            <div style="display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
              <Tab value="all" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">
                All ({() => allItems().length})
              </Tab>
              <Tab value="unread" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">
                Unread ({() => unreadItems().length})
              </Tab>
              <Tab value="archived" {...{ variant: 'line' } as any} style="padding: 8px 16px; cursor: pointer;">
                Archived ({() => archivedItems().length})
              </Tab>
            </div>

            <TabPanel value="all">
              {() => renderList(allItems())}
            </TabPanel>
            <TabPanel value="unread">
              {() => renderList(unreadItems())}
            </TabPanel>
            <TabPanel value="archived">
              {() => renderList(archivedItems())}
            </TabPanel>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}
