import { signal } from '@pyreon/reactivity'

/**
 * "Was this page helpful?" (an island, `DocsHelpfulIsland`). Nothing is
 * recorded (the site has no analytics). "No" turns into a link to a GitHub
 * issue that names the page, which is the one thing that actually gets a page
 * fixed.
 */
export default function Helpful(props: { title: string; url: string }) {
  const answer = signal<'yes' | 'no' | null>(null)
  const issue = `https://github.com/pyreon/pyreon/issues/new?title=${encodeURIComponent(`docs: ${props.title}`)}&body=${encodeURIComponent(`Page: ${props.url}\n\nWhat was missing or wrong:\n`)}`
  return (
    <div class="dx-helpful">
      {() =>
        answer() === null ? (
          <>
            <span id="dx-helpful-q">Was this page helpful?</span>
            <button type="button" aria-describedby="dx-helpful-q" onClick={() => answer.set('yes')}>
              Yes
            </button>
            <button type="button" aria-describedby="dx-helpful-q" onClick={() => answer.set('no')}>
              No
            </button>
          </>
        ) : answer() === 'yes' ? (
          <output>Good to hear. Nothing was recorded: this site has no analytics.</output>
        ) : (
          <output>
            Sorry about that.{' '}
            <a href={issue} rel="noopener noreferrer">
              Tell us what is missing on GitHub
            </a>
            .
          </output>
        )
      }
    </div>
  )
}
