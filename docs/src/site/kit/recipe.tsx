import { CodeCard } from './code'
import { el } from './bases'
import { StatusBadge } from './type'

/**
 * Small additions to the product template's recipes and coming-from sections.
 */

/** "Coming from A, B or C?": each library once, in order, joined the way a person writes it. */
export function comingFromTitle(libs: readonly string[]): string {
  const unique = [...new Set(libs)]
  const list = unique.length > 1 ? `${unique.slice(0, -1).join(', ')} or ${unique[unique.length - 1]}` : (unique[0] ?? '')
  return `Coming from ${list}?`
}

const BadgeRow = el.config({ name: 'RecipeBadgeRow' }).attrs({ block: true }).theme(() => ({ marginBottom: 8, extendCss: '& > span { margin-left: 0; }' }))
const RecipeBox = el.config({ name: 'Recipe' }).attrs({ block: true }).theme(() => ({ minWidth: 0 }))

/** A recipe's code card; a `status` (e.g. "next release") shows as the template's status badge above it. */
export function RecipeCard(props: { title: string; text: string; code: string; codeHtml?: string | undefined; status?: string | undefined }) {
  return (
    <RecipeBox>
      {props.status ? (
        <BadgeRow>
          <StatusBadge>{props.status}</StatusBadge>
        </BadgeRow>
      ) : null}
      <CodeCard label={props.title} caption={props.text} code={props.code} html={props.codeHtml} />
    </RecipeBox>
  )
}
