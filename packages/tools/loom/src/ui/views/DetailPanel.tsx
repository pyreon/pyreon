/**
 * The detail rail — the selected node as the design lays it out: name +
 * tags, three numbers (deps · dependents · blast), its findings, what it
 * depends on, its blast radius, the resolution path, and the `loom.ignore`
 * entry that would suppress its first suppressible finding. An external
 * dependency gets its declared ranges and who declares each instead.
 */
import { cx, type VNodeChild } from '@pyreon/core'
import * as C from '../chrome'
import {
  blastRadius,
  issuesFor,
  pathTo,
  shortName,
  suppressSnippet,
  type ObservatoryModel,
} from '../model'

const MAX_FINDINGS = 8
const MAX_CHIPS = 60

export function DetailPanel(props: { model: ObservatoryModel }) {
  const m = props.model
  // A chip keeps the rail open, also as a drawer: you came to read the next one.
  const go = (id: string) => {
    if (m.byId.has(id)) m.select(id)
  }

  const chips = (ids: readonly string[], empty: string, testid: string): VNodeChild =>
    ids.length === 0 ? (
      <C.Note>{empty}</C.Note>
    ) : (
      <>
        <div class="lm-chips" data-testid={testid}>
          {ids.slice(0, MAX_CHIPS).map((d) => {
            const node = m.byId.get(d)
            return (
              <button
                type="button"
                class={node?.kind === 'external' ? 'lm-chip lm-chip--ext' : 'lm-chip'}
                title={d}
                onClick={() => go(d)}
              >
                {d}
              </button>
            )
          })}
        </div>
        {ids.length > MAX_CHIPS ? (
          <div class="lm-more">{`+ ${ids.length - MAX_CHIPS} more — the impact view lists them all`}</div>
        ) : null}
      </>
    )

  return (
    <C.Panel data-testid="loom-panel" aria-label="Package detail">
      {() => {
        const n = m.sel()
        const issues = issuesFor(m.report, n.id)
        const blast = n.id === m.selId() ? m.blast() : blastRadius(m.byId, n.id)
        const internal = n.kind === 'internal'
        const ext = internal ? undefined : m.report.external.find((e) => e.name === n.id)
        const suppressible = issues.find((i) => i.severity !== 'info' && i.ignored === undefined)
        const path = internal ? pathTo(m, n.id) : [n.id]

        return (
          <>
            <C.PanelHead>
              <C.PanelName data-testid="panel-name">{n.id}</C.PanelName>
              <div class="lm-tags">
                {internal ? (
                  <>
                    <span class="lm-tag">{n.private ? 'private' : 'published'}</span>
                    <span class="lm-tag">{`v${n.version}`}</span>
                    <span class="lm-tag">{`depth ${n.depth}`}</span>
                  </>
                ) : (
                  <>
                    <span class="lm-tag lm-tag--ext">external</span>
                    <span class="lm-tag">{n.version}</span>
                  </>
                )}
                {m.cycleNodes.has(n.id) ? <span class="lm-tag lm-tag--danger">in a cycle</span> : null}
                <span
                  data-testid="panel-status"
                  class={
                    n.errors
                      ? 'lm-tag lm-tag--danger'
                      : n.warnings
                        ? 'lm-tag lm-tag--warn'
                        : 'lm-tag lm-tag--ok'
                  }
                >
                  {n.errors
                    ? `${n.errors} error${n.errors === 1 ? '' : 's'}`
                    : n.warnings
                      ? `${n.warnings} warning${n.warnings === 1 ? '' : 's'}`
                      : 'clean'}
                </span>
              </div>
            </C.PanelHead>

            <C.Stats data-testid="panel-stats">
              <C.Stat>
                <C.StatLabel>{internal ? 'deps' : 'ranges'}</C.StatLabel>
                <C.StatValue variant="plain">
                  {String(internal ? n.deps.length : Object.keys(ext?.ranges ?? {}).length)}
                </C.StatValue>
              </C.Stat>
              <C.Stat>
                <C.StatLabel>{internal ? 'dependents' : 'users'}</C.StatLabel>
                <C.StatValue variant="plain">{String(n.dependents.length)}</C.StatValue>
              </C.Stat>
              <C.Stat>
                <C.StatLabel>blast</C.StatLabel>
                <C.StatValue variant="accent" data-testid="panel-blast">
                  {String(blast.length)}
                </C.StatValue>
              </C.Stat>
            </C.Stats>

            <C.Section>
              <C.SectionHead>
                <span>findings</span>
                <span>{String(issues.length)}</span>
              </C.SectionHead>
              {issues.length === 0 ? (
                <C.Note>No findings for this package.</C.Note>
              ) : (
                <>
                  {issues.slice(0, MAX_FINDINGS).map((issue) => (
                    <div
                      class={cx(['lm-fd', `lm-fd--${issue.severity}`])}
                      data-testid={`finding-${issue.code}`}
                    >
                      <div class="lm-fh">
                        <span class={cx(['lm-sev', `lm-sev--${issue.severity}`])} aria-hidden="true" />
                        {issue.code}
                        <em>{issue.ignored !== undefined ? 'ignored' : issue.severity}</em>
                      </div>
                      <p>{issue.message}</p>
                    </div>
                  ))}
                  {issues.length > MAX_FINDINGS ? (
                    <div class="lm-more">{`+ ${issues.length - MAX_FINDINGS} more in loom-report.json`}</div>
                  ) : null}
                </>
              )}
            </C.Section>

            {internal ? (
              <C.Section>
                <C.SectionHead>
                  <span>depends on</span>
                  <span>{String(n.deps.length)}</span>
                </C.SectionHead>
                {chips(n.deps, 'Nothing at runtime — a leaf.', 'panel-deps')}
              </C.Section>
            ) : (
              <C.Section>
                <C.SectionHead>
                  <span>declared ranges</span>
                  <span>{String(Object.keys(ext?.ranges ?? {}).length)}</span>
                </C.SectionHead>
                {Object.entries(ext?.ranges ?? {})
                  // Most-declared range first, then by range text — never
                  // the manifest walk's insertion order.
                  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
                  .map(([range, users]) => (
                  <div class="lm-fd" data-testid="panel-range">
                    <div class="lm-fh">{range}</div>
                    <p>
                      {users
                        .map((u) => `${u.user === 'ROOT' ? 'root' : shortName(u.user)} (${u.field})`)
                        .join(' · ')}
                    </p>
                  </div>
                ))}
              </C.Section>
            )}

            <C.Section>
              <C.SectionHead>
                <span>blast radius</span>
                <span>{String(blast.length)}</span>
              </C.SectionHead>
              {chips(blast, 'Nothing in the workspace depends on it.', 'panel-blast-list')}
            </C.Section>

            {internal ? (
              <C.Section>
                <C.SectionHead>
                  <span>resolution path</span>
                </C.SectionHead>
                <div class="lm-code">
                  <pre data-testid="panel-path">
                    {path.map((x, i) => (i ? `${'  '.repeat(i - 1)}└─ ` : '') + x).join('\n')}
                  </pre>
                </div>
              </C.Section>
            ) : null}

            {suppressible ? (
              <C.Section>
                <C.SectionHead>
                  <span>suppress a finding</span>
                </C.SectionHead>
                <div class="lm-code">
                  <pre data-testid="panel-suppress">{suppressSnippet(suppressible)}</pre>
                </div>
              </C.Section>
            ) : null}
          </>
        )
      }}
    </C.Panel>
  )
}
