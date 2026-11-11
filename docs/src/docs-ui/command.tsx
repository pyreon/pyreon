import { useClipboard } from '@pyreon/hooks'

/**
 * A shell command printed in full (it wraps instead of truncating, so the
 * exact command is always readable) with a copy button. The `$` prompt is
 * cyan, as everywhere on the site (A12).
 */
export function Command(props: { command: string }) {
  const clip = useClipboard()
  return (
    <div class="dx-cmd">
      <code>
        <span class="dx-cmd__prompt" aria-hidden="true">
          $
        </span>{' '}
        {props.command}
      </code>
      <button type="button" class="dx-cmd__copy" aria-label={`Copy: ${props.command}`} onClick={() => void clip.copy(props.command)}>
        {() => (clip.copied() ? 'copied' : 'copy')}
      </button>
    </div>
  )
}
