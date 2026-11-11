import { StableLinkPage } from '../../components/StableLinkPage'
import { DISCORD_COPY } from '../../site/content/channels'
import { resolveSiteLink } from '../../site-links'

/** `/discord` — forwards to the community server once `SITE_LINKS.discord` is set. */
export default function DiscordPage() {
  return <StableLinkPage copy={DISCORD_COPY} target={resolveSiteLink('discord')} />
}
