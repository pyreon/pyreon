import { For, Show } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, radius, text, weight } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { Segmented } from '../kit/controls'
import { Eyebrow, StatusDot } from '../kit/type'
import { LOOM_CAPTURED, LOOM_REPORT } from './_capture-loom'

/**
 * Loom demo (`loom.json` → demo): the observatory's four reading views over
 * a REAL `loom scan --json` report of a sample workspace
 * (docs/scripts/capture-loom-demo.ts writes the workspace and captures the
 * report). Every edge, cycle, reach count and finding message is Loom's; the
 * demo only lays them out. Depth is not shown: Loom's depth is inflated
 * around a cycle in this report (reported with the slice).
 */
type View = 'packages' | 'matrix' | 'cycles' | 'impact'
type Severity = 'error' | 'warning' | 'info'

const R = LOOM_REPORT
const NAMES = R.model.packages.map((p) => p.name).sort()
const short = (n: string) => n.replace(/^@acme\//, '')
const depsOf = (n: string): string[] => R.graph.edges.flatMap((e) => (e[0] === n && e[1] ? [e[1]] : []))
const usersOf = (n: string): string[] => R.graph.edges.flatMap((e) => (e[1] === n && e[0] ? [e[0]] : []))
const inCycle = new Set(R.graph.cycles.flat())
const cycleEdge = (a: string, b: string) =>
  R.graph.cycles.some((c) => c.some((x, i) => x === a && c[(i + 1) % c.length] === b))
const findingsOf = (n: string) => R.issues.filter((i) => i.pkg === n || i.dep === n)
const worst = (n: string): 'err' | 'warn' | 'ok' => {
  const f = findingsOf(n)
  if (inCycle.has(n) || f.some((i) => i.severity === 'error')) return 'err'
  return f.some((i) => i.severity === 'warning') ? 'warn' : 'ok'
}
const MAX_REACH = Math.max(1, ...Object.values(R.graph.reach))
const IMPACT = [...NAMES].sort((a, b) => (R.graph.reach[b] ?? 0) - (R.graph.reach[a] ?? 0) || a.localeCompare(b))

const Stats = txt
  .config({ name: 'LoomStats' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Bar = el
  .config({ name: 'LoomBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap', marginBottom: 16 }))

const Split = el
  .config({ name: 'LoomSplit' })
  .attrs({ block: true })
  .theme(() => ({
    extendCss: `&& { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
      @media (min-width: 720px) { && { grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); } }`,
  }))

const List = el
  .config({ name: 'LoomList' })
  .attrs({ tag: 'ul', block: true, gap: 2, contentAlignY: 'top' })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0, minWidth: 0 }))

const PkgButton = el
  .config({ name: 'LoomPkg' })
  .attrs<ButtonAttrs>({ tag: 'button', block: true, contentDirection: 'inline', contentAlignY: 'center', contentAlignX: 'left', gap: 4 })
  .theme((_t, m) => ({
    width: '100%',
    minHeight: 30,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: radius.small,
    border: '1px solid transparent',
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: 12.5,
    textAlign: 'left',
    transition: `background-color ${motion.hover}`,
    hover: { backgroundColor: tone(m, 'hoverFill'), color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'strong') },
  }))

const Pane = el
  .config({ name: 'LoomPane' })
  .attrs({ block: true, gap: 14, contentAlignY: 'top' })
  .theme((_t, m) => ({
    minWidth: 0,
    padding: 18,
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
  }))

const Name = txt
  .config({ name: 'LoomName' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: 16, fontWeight: weight.medium, color: tone(m, 'strong'), overflowWrap: 'anywhere' }))

const Line = txt
  .config({ name: 'LoomLine' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.ui.size, lineHeight: 1.55, color: tone(m, 'mist') }))

const Chips = el
  .config({ name: 'LoomChips' })
  .attrs({ block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', marginTop: 6 }))

const ChipButton = el
  .config({ name: 'LoomChip' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 28,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

const Finding = txt
  .config({ name: 'LoomFinding' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    paddingTop: 10,
    paddingBottom: 10,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.caption.size,
    lineHeight: 1.55,
    color: tone(m, 'mist'),
    listStyle: 'none',
  }))

const Sev = txt
  .config({ name: 'LoomSeverity' })
  .attrs({ tag: 'b' })
  .theme(() => ({ marginRight: 8, fontFamily: font.mono, fontWeight: weight.regular, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }))
  .states((_t, m) => ({ error: { color: tone(m, 'err') }, warning: { color: tone(m, 'warn') }, info: { color: tone(m, 'fog') } }))

const Scroll = el
  .config({ name: 'LoomScroll' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    overflow: 'auto',
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    focus: { ...focusRing(m), outlineOffset: '-2px' },
    extendCss: `
      & table { border-collapse: collapse; font-family: ${font.mono}; font-size: 11.5px; color: ${tone(m, 'mist')}; }
      & th, & td { padding: 6px 8px; text-align: center; border-bottom: 1px solid ${tone(m, 'line')}; }
      & thead th { vertical-align: bottom; font-weight: 400; color: ${tone(m, 'fog')}; }
      & thead th span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
      & tbody th { text-align: left; font-weight: 400; color: ${tone(m, 'text')}; white-space: nowrap; }
      & td[data-e='dep'] { color: ${tone(m, 'link')}; }
      & td[data-e='cycle'] { color: ${tone(m, 'err')}; }
      & caption { caption-side: bottom; padding: 10px; text-align: left; font-family: ${font.sans}; font-size: 12px; color: ${tone(m, 'fog')}; }
    `,
  }))

const ImpactList = txt
  .config({ name: 'LoomImpact' })
  .attrs({ tag: 'div' })
  .theme((_t, m) => ({
    extendCss: `
      && { display: block; width: 100%; }
      & ul { width: 100%; margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
      & li { display: grid; grid-template-columns: minmax(84px, 120px) minmax(0, 1fr) 28px; gap: 10px; align-items: center;
        font-family: ${font.mono}; font-size: ${text.mono.size}px; color: ${tone(m, 'mist')}; }
      & li > i { display: block; height: 10px; border-radius: 99px; background: ${tone(m, 'line')}; overflow: hidden; }
      & li > i > s { display: block; height: 100%; border-radius: 99px; background: ${tone(m, 'accent')}; }
      & li > b { font-weight: 400; text-align: right; color: ${tone(m, 'text')}; }
    `,
  }))

const Foot = txt
  .config({ name: 'LoomFoot' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ display: 'block', margin: 0, marginTop: 16, fontFamily: font.mono, fontSize: 11, lineHeight: 1.5, color: tone(m, 'fog') }))

const VIEWS: readonly View[] = ['packages', 'matrix', 'cycles', 'impact']

export default function DemoLoom() {
  const view = signal<View>('packages')
  const sel = signal('@acme/ui')
  const pkg = computed(() => R.model.packages.find((p) => p.name === sel()))

  const chips = (names: readonly string[]) =>
    names.length === 0 ? (
      <Line>none</Line>
    ) : (
      <Chips>
        <For each={names} by={(n) => n}>
          {(n) => (
            <ChipButton type="button" onClick={() => sel.set(n)} aria-label={`Select ${n}`}>
              {short(n)}
            </ChipButton>
          )}
        </For>
      </Chips>
    )

  return (
    <GlowCard padding="compact">
      <Bar>
        <Segmented options={VIEWS} value={() => view()} onChange={(v) => view.set(v)} label="Observatory view" />
        <Stats>
          {R.stats.internal} packages · {R.stats.edges} edges · {R.stats.cycles} cycle · {R.stats.errors} errors · {R.stats.warnings} warnings ·{' '}
          {R.stats.infos} info
        </Stats>
      </Bar>

      <Show when={() => view() === 'packages'}>
        <Split>
          <List aria-label="Workspace packages">
            <For each={NAMES} by={(n) => n}>
              {(n) => (
                <li>
                  <PkgButton type="button" aria-pressed={() => (sel() === n ? 'true' : 'false')} onClick={() => sel.set(n)}>
                    <StatusDot state={worst(n)} />
                    {short(n)}
                  </PkgButton>
                </li>
              )}
            </For>
          </List>
          <Pane>
            {() => {
              const n = sel()
              const p = pkg()
              const findings = findingsOf(n)
              return (
                <>
                  <div>
                    <Name>{n}</Name>
                    <Line>
                      {p?.version ?? ''}
                      {p?.private ? ' · private' : ''}
                      {inCycle.has(n) ? ' · in a runtime cycle' : ''}
                    </Line>
                  </div>
                  <div>
                    <Eyebrow>needed by</Eyebrow>
                    {chips(usersOf(n))}
                    <Line>
                      {`${R.graph.reach[n] ?? 0} package${R.graph.reach[n] === 1 ? '' : 's'} depend on it, directly or through others.`}
                    </Line>
                  </div>
                  <div>
                    <Eyebrow>depends on</Eyebrow>
                    {chips(depsOf(n))}
                  </div>
                  <div>
                    <Eyebrow>{`findings · ${findings.length}`}</Eyebrow>
                    <ul style="margin:6px 0 0;padding:0">
                      {findings.length === 0 ? <Finding>none</Finding> : null}
                      {findings.map((f) => (
                        <Finding>
                          <Sev state={f.severity as Severity}>{f.severity}</Sev>
                          <b>{f.code}</b> {f.message}
                        </Finding>
                      ))}
                    </ul>
                  </div>
                </>
              )
            }}
          </Pane>
        </Split>
      </Show>

      <Show when={() => view() === 'matrix'}>
        <Scroll tabIndex={0} aria-label="Dependency matrix">
          <table>
            <caption>Row depends on column at runtime. ● an edge, ↻ an edge inside a cycle.</caption>
            <thead>
              <tr>
                <th scope="col">package</th>
                {NAMES.map((c) => (
                  <th scope="col">
                    <span>{short(c)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAMES.map((r) => {
                const deps = new Set(depsOf(r))
                return (
                  <tr>
                    <th scope="row">{short(r)}</th>
                    {NAMES.map((c) =>
                      deps.has(c) ? (
                        <td data-e={cycleEdge(r, c) ? 'cycle' : 'dep'} aria-label={`${short(r)} depends on ${short(c)}`}>
                          {cycleEdge(r, c) ? '↻' : '●'}
                        </td>
                      ) : (
                        <td />
                      ),
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Scroll>
      </Show>

      <Show when={() => view() === 'cycles'}>
        <Pane>
          {R.graph.cycles.map((c) => (
            <div>
              <Eyebrow>runtime cycle</Eyebrow>
              <Chips>
                {[...c, c[0] ?? ''].map((n, i) => (
                  <>
                    {i > 0 ? <Line tag="span">→</Line> : null}
                    <ChipButton
                      type="button"
                      onClick={() => {
                        sel.set(n)
                        view.set('packages')
                      }}
                      aria-label={`Open ${n}`}
                    >
                      {short(n)}
                    </ChipButton>
                  </>
                ))}
              </Chips>
              {R.issues
                .filter((i) => i.code === 'cycle' && c.includes(i.pkg))
                .map((i) => (
                  <Line>{i.message}</Line>
                ))}
            </div>
          ))}
        </Pane>
      </Show>

      <Show when={() => view() === 'impact'}>
        <Pane>
          <Eyebrow>blast radius · packages that depend on each one</Eyebrow>
          <ImpactList>
            <ul>
              {IMPACT.map((n) => (
                <li>
                  <span>{short(n)}</span>
                  <i aria-hidden="true">
                    <s style={`width:${((R.graph.reach[n] ?? 0) / MAX_REACH) * 100}%`} />
                  </i>
                  <b>{String(R.graph.reach[n] ?? 0)}</b>
                </li>
              ))}
            </ul>
          </ImpactList>
        </Pane>
      </Show>

      <Foot>
        real output · the <b>loom scan</b> report of a sample workspace (its files are in docs/scripts/capture-loom-demo.ts), captured {LOOM_CAPTURED}
      </Foot>
    </GlowCard>
  )
}
