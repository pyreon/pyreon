import { useHead } from '@pyreon/head'
import { useRouter } from '@pyreon/router'
import { onMount } from '@pyreon/core'
import { useChatModel } from '../lib/chat-store'

/**
 * Root route — redirects to the user's last-visited channel
 * (defaults to "general" on first visit).
 */
export default function IndexPage() {
  useHead({ title: 'Chat — Pyreon' })

  const router = useRouter()
  const store = useChatModel()

  onMount(() => {
    const last = store.lastVisitedChannelId() as string
    router.replace(`/channels/${last}`)
  })

  return <div class="chat-empty" data-testid="chat-empty" />
}
