import { For } from '@pyreon/core'
import { color } from '../theme'
import { GlowCard } from './cards'
import { CodeBody, CodeHead } from './code'
import { CopyButtonIsland } from './islands'
import { Eyebrow, renderInline } from './type'
import { Stack } from './primitives'

/* Static pages only: kept out of code.tsx, which the demo islands bundle. */

/** The `$` of a terminal line: the prompt colour, through the Shiki variables the code body reads. */
const promptVars = `--shiki-light:${color.prompt.light};--shiki-dark:${color.prompt.dark};margin-right:10px`

/**
 * A shell session as a code card: the same frame and head as `CodeCard`
 * (label left, copy button right) and one `$`-prompted line per step. The
 * button copies `copy`, the whole command as one line.
 */
export function TerminalCard(props: { label: string; lines: readonly string[]; copy: string; 'aria-label'?: string | undefined }) {
  return (
    <GlowCard padding="flush">
      <CodeHead>
        <Stack gap={75} alignX="left" shrink>
          <Eyebrow>{renderInline(props.label)}</Eyebrow>
        </Stack>
        <CopyButtonIsland text={props.copy} />
      </CodeHead>
      <CodeBody tag="pre" tabIndex={0} aria-label={props['aria-label'] ?? props.label}>
        <For each={props.lines.map((line, i) => ({ line, i }))} by={(l) => l.i}>
          {(l) => (
            <div>
              <span aria-hidden="true" style={promptVars}>
                $
              </span>
              {l.line}
            </div>
          )}
        </For>
      </CodeBody>
    </GlowCard>
  )
}
