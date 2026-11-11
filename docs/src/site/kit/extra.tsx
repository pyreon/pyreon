import { For } from '@pyreon/core'
import type { ExtraSectionMore } from '../content/extra-sections.more'
import { font, radius, text, weight } from '../theme'
import { el, tone, txt } from './bases'
import { GlowCard } from './cards'
import { ApiGroups } from './blocks'
import { CodeCard } from './code'
import { AutoGrid } from './layout'
import { Eyebrow, Heading, Lede, renderInline } from './type'

/**
 * Bodies for the extra-section kinds in `content/extra-sections.more.ts`
 * (terminal output, tool cards, a data table, chip groups, package rows).
 * The product template renders the section head; this renders what is under it.
 */

const Mono = txt
  .config({ name: 'ExtraMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'accentText'), overflowWrap: 'anywhere' }))

const Rows = el.config({ name: 'ExtraRows' }).attrs({ block: true, gap: 12 })

const Cmd = txt
  .config({ name: 'ExtraCmd' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 14,
    paddingTop: 9,
    paddingBottom: 9,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: radius.note,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'mist'),
    overflowWrap: 'anywhere',
  }))

const Prompt = txt.config({ name: 'ExtraPrompt' }).attrs({ tag: 'span', 'aria-hidden': 'true' }).theme((_t, m) => ({ color: tone(m, 'prompt'), marginRight: 8 }))

/** `.p-inside` with the inline grammar in its text (code spans). */
function InlinePackageCard(props: { pkg: string; role: string; text: string; hot?: boolean | undefined }) {
  return (
    <GlowCard padding="compact" state={props.hot ? 'hot' : 'default'}>
      <Mono>{props.pkg}</Mono>
      <Eyebrow>{props.role}</Eyebrow>
      <Lede size="small">{renderInline(props.text)}</Lede>
    </GlowCard>
  )
}

const TableBox = el
  .config({ name: 'ExtraTable' })
  .attrs({ tag: 'table' })
  .theme((_t, m) => ({
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    color: tone(m, 'mist'),
    extendCss: `
      & th, & td { border: 0; background: transparent; }
      & th { text-align: left; font-family: ${font.mono}; font-size: ${text.eyebrow.size}px; letter-spacing: ${text.eyebrow.tracking};
        text-transform: uppercase; font-weight: ${weight.medium}; color: ${tone(m, 'fog')}; padding: 0 14px 10px 0; }
      & td { padding: 12px 14px 12px 0; border: 0; border-top: 1px solid ${tone(m, 'line')}; vertical-align: top; }
      & td:first-child { font-family: ${font.mono}; font-size: ${text.mono.size}px; color: ${tone(m, 'text')}; white-space: nowrap; }
      @media (max-width: 699px) {
        & thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
        & tr { display: block; padding: 12px 0; border-top: 1px solid ${tone(m, 'line')}; }
        & td { display: block; border: 0; padding: 2px 0; }
        & td:first-child { white-space: normal; overflow-wrap: anywhere; }
        & td[data-label]::before { content: attr(data-label) ' · '; color: ${tone(m, 'fog')}; font-family: ${font.mono}; font-size: ${text.eyebrow.size}px; text-transform: uppercase; letter-spacing: ${text.eyebrow.tracking}; }
      }
    `,
  }))

function DataTable(props: { columns: readonly string[]; rows: readonly (readonly string[])[]; caption: string }) {
  const rows = props.rows.map((cells, i) => ({ i, cells: cells.map((c, j) => ({ j, c })) }))
  return (
    <GlowCard padding="compact">
      <TableBox aria-label={props.caption}>
        <thead>
          <tr>
            <For each={props.columns.map((c, j) => ({ c, j }))} by={(c) => c.j}>
              {(c) => <th scope="col">{c.c}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={rows} by={(r) => r.i}>
            {(r) => (
              <tr>
                <For each={r.cells} by={(c) => c.j}>
                  {(c) => <td data-label={c.j > 0 ? props.columns[c.j] : undefined}>{c.c}</td>}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </TableBox>
    </GlowCard>
  )
}

/** The body of one `ExtraSectionMore` (its head is the template's `SectionHead`). */
export function ExtraMoreBody(props: { section: ExtraSectionMore }) {
  const s = props.section
  switch (s.kind) {
    case 'terminal':
      return <CodeCard label={s.command} caption="real output" code={s.output} />
    case 'tools':
      return (
        <AutoGrid min={250} gap={12}>
          <For each={s.items} by={(i) => i.name}>
            {(i) => (
              <GlowCard padding="compact" state={i.hot ? 'hot' : 'default'}>
                <Mono>{i.name}</Mono>
                <Heading tag="h3" size="step">
                  {i.title}
                </Heading>
                <Lede size="small">{renderInline(i.text)}</Lede>
                <Cmd>
                  {i.prompt ? <Prompt>$</Prompt> : null}
                  {i.cmd}
                </Cmd>
              </GlowCard>
            )}
          </For>
        </AutoGrid>
      )
    case 'table':
      return <DataTable columns={s.columns} rows={s.rows} caption={s.title} />
    case 'chips':
      return <ApiGroups groups={s.groups} />
    case 'packageRows':
      return (
        <Rows>
          <For each={s.rows.map((r, i) => ({ ...r, i }))} by={(r) => r.i}>
            {(r) => (
              <AutoGrid cols={r.cols} gap={12}>
                <For each={r.items} by={(i) => i.pkg}>
                  {(i) => <InlinePackageCard pkg={i.pkg} role={i.role} text={i.text} hot={i.hot} />}
                </For>
              </AutoGrid>
            )}
          </For>
        </Rows>
      )
  }
}

/** True for the kinds this file renders. */
export function isExtraMore(s: { kind: string }): s is ExtraSectionMore {
  return s.kind === 'terminal' || s.kind === 'tools' || s.kind === 'table' || s.kind === 'chips' || s.kind === 'packageRows'
}
