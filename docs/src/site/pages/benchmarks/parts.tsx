import { VerdictChip } from '../../kit/bench'

/** A verdict chip and its label as one element, so a table cell holds a single node. */
export function VerdictNote(props: { verdict: string; label: string }) {
  return (
    <span>
      <VerdictChip verdict={props.verdict} /> {props.label}
    </span>
  )
}
