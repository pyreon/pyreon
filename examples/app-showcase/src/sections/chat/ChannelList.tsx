import {
  ChannelButton,
  ChannelHash,
  ChannelMembers,
  ChannelSidebar,
  SidebarHeader,
  SidebarLabel,
  SidebarSubtitle,
  SidebarTitle,
} from './styled'
import { useChat } from './store'

/**
 * Channel sidebar. Shows the workspace name + a list of channels with
 * member counts. Clicking a channel updates `selectedChannelId` in the
 * chat store, which triggers a re-render of the message list.
 */
export function ChannelList() {
  const chat = useChat()
  const { store } = chat

  return (
    <ChannelSidebar>
      <SidebarHeader>
        <SidebarTitle>Pyreon HQ</SidebarTitle>
        <SidebarSubtitle>5 channels · mock chat</SidebarSubtitle>
      </SidebarHeader>

      <div>
        <SidebarLabel>Channels</SidebarLabel>
        {store.channels.map((channel) => (
          <ChannelButton
            type="button"
            $active={store.selectedChannelId() === channel.id}
            onClick={() => store.selectChannel(channel.id)}
          >
            <span>
              <ChannelHash>#</ChannelHash>
              {channel.name}
            </span>
            <ChannelMembers>{channel.memberCount}</ChannelMembers>
          </ChannelButton>
        ))}
      </div>
    </ChannelSidebar>
  )
}
