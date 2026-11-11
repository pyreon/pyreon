import { CopyButtonIsland } from '../site/kit/islands'

/**
 * A shell command printed in full (it wraps instead of truncating, so the
 * exact command is always readable) with the site's copy button (the same
 * island the marketing pages use). The `$` prompt is cyan, as everywhere on
 * the site (A12).
 */
export function Command(props: { command: string }) {
  return (
    <div class="dx-cmd">
      <code>
        <span class="dx-cmd__prompt" aria-hidden="true">
          $
        </span>{' '}
        {props.command}
      </code>
      <CopyButtonIsland text={props.command} />
    </div>
  )
}
