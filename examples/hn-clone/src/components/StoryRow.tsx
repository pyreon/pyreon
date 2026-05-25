import { Link } from '@pyreon/zero/link'
import type { Story } from '../lib/api'

export interface StoryRowProps {
  story: Story
  rank: number
}

export default function StoryRow(props: StoryRowProps) {
  const story = props.story
  const isJob = story.type === 'job'

  return (
    <li class="story-row">
      <span class="story-rank">{props.rank}.</span>
      <div class="story-body">
        <div class="story-title">
          {story.url.startsWith('http') ? (
            <a href={story.url} target="_blank" rel="noreferrer" class="story-link">
              {story.title}
            </a>
          ) : (
            <Link href={`/item/${story.id}`} class="story-link">
              {story.title}
            </Link>
          )}
          {story.domain && <span class="story-domain"> ({story.domain})</span>}
        </div>
        <div class="story-meta">
          {!isJob && (
            <>
              <span>{story.points} points</span>
              <span>by </span>
              {story.user && (
                <Link href={`/user/${story.user}`} class="story-user">
                  {story.user}
                </Link>
              )}
              <span> {story.time_ago}</span>
              <span> | </span>
            </>
          )}
          <Link href={`/item/${story.id}`} class="story-comments">
            {story.comments_count > 0 ? `${story.comments_count} comments` : 'discuss'}
          </Link>
        </div>
      </div>
    </li>
  )
}
