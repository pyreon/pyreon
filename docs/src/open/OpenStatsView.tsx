import { Axis, Bar, Chart, Tooltip, compact } from '@pyreon/charts'
import { RouterLink } from '@pyreon/router'
import {
  formatCount,
  formatDay,
  formatTimestamp,
  type OpenStats,
  type Stat,
  REPO,
} from './stats'

const GITHUB = `https://github.com/${REPO}`
export const UNAVAILABLE = 'unavailable right now'

interface TileProps {
  label: string
  stat: Stat<number>
  hint?: string | undefined
  href?: string
}

/** One number. A missing number says so — it never renders as 0. */
function Tile(props: TileProps) {
  const stat = props.stat
  const body = (
    <>
      <span class="open-tile__label">{props.label}</span>
      {stat.ok ? (
        <span class="open-tile__value">{formatCount(stat.value)}</span>
      ) : (
        <span class="open-tile__value open-tile__value--missing" title={stat.reason}>
          {UNAVAILABLE}
        </span>
      )}
      {props.hint ? <span class="open-tile__hint">{props.hint}</span> : null}
    </>
  )
  return props.href ? (
    <a class="open-tile open-tile--link" href={props.href} rel="noopener">
      {body}
    </a>
  ) : (
    <div class="open-tile">{body}</div>
  )
}

interface ChartRow {
  label: string
  downloads: number
}

function DownloadTrend(props: { stats: OpenStats }) {
  const trend = props.stats.npm.trend
  if (!trend.ok) {
    return (
      <p class="open-chart open-chart--missing">
        Download history is {UNAVAILABLE}. It comes back with the next deploy.
      </p>
    )
  }
  const rows: ChartRow[] = trend.value.points.map((p) => ({
    label: new Date(p.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    downloads: p.downloads,
  }))
  return (
    <figure class="open-chart">
      <Chart<ChartRow>
        data={rows}
        x="label"
        height={260}
        animate={false}
        title={`Weekly npm downloads, ${trend.value.label}`}
      >
        <Bar y="downloads" label="Downloads" />
        <Axis y format={compact} />
        <Tooltip />
      </Chart>
      <figcaption>
        Weekly downloads of {trend.value.label}, the package every Pyreon app installs, from npm's
        public download counts.
      </figcaption>
    </figure>
  )
}

export function OpenStatsView(props: { stats: OpenStats }) {
  const stats = props.stats
  const gh = stats.github
  const release = gh.latestRelease
  const repo = stats.repo

  return (
    <div class="site-page open-page">
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Open stats</p>
        <h1>Everything in the open</h1>
        <p class="site-page__lead">
          Stars, downloads, issues, releases: every number on this page comes straight from
          GitHub, npm and the repository itself, refreshed by each deploy. Nobody types them in,
          nobody rounds them up.
        </p>
        <p class="open-updated">
          Last updated <time datetime={stats.generatedAt}>{formatTimestamp(stats.generatedAt)}</time>
        </p>
      </header>

      <section class="site-section" aria-labelledby="open-github">
        <h2 id="open-github">On GitHub</h2>
        <div class="open-grid">
          <Tile label="Stars" stat={gh.stars} href={`${GITHUB}/stargazers`} />
          <Tile label="Forks" stat={gh.forks} href={`${GITHUB}/forks`} />
          <Tile label="Contributors" stat={gh.contributors} href={`${GITHUB}/graphs/contributors`} />
          <Tile label="Merged pull requests" stat={gh.mergedPrs} href={`${GITHUB}/pulls?q=is%3Apr+is%3Amerged`} />
          <Tile label="Open issues" stat={gh.openIssues} href={`${GITHUB}/issues`} />
          <Tile label="Closed issues" stat={gh.closedIssues} href={`${GITHUB}/issues?q=is%3Aissue+is%3Aclosed`} />
          {release.ok ? (
            <a class="open-tile open-tile--link" href={release.value.url} rel="noopener">
              <span class="open-tile__label">Latest release</span>
              <span class="open-tile__value">{release.value.tag}</span>
              <span class="open-tile__hint">{formatDay(release.value.date)}</span>
            </a>
          ) : (
            <div class="open-tile">
              <span class="open-tile__label">Latest release</span>
              <span class="open-tile__value open-tile__value--missing" title={release.reason}>
                {UNAVAILABLE}
              </span>
            </div>
          )}
        </div>
      </section>

      <section class="site-section" aria-labelledby="open-npm">
        <h2 id="open-npm">On npm</h2>
        <p class="site-section__intro">Downloads in the last 7 days, with the last 30 underneath.</p>
        <div class="open-grid">
          {stats.npm.packages.map((p) => (
            <Tile
              label={p.name}
              stat={p.weekly}
              hint={p.monthly.ok ? `${formatCount(p.monthly.value)} in the last 30 days` : undefined}
              href={`https://www.npmjs.com/package/${p.name}`}
            />
          ))}
        </div>
        <DownloadTrend stats={stats} />
      </section>

      <section class="site-section" aria-labelledby="open-repo">
        <h2 id="open-repo">Inside the repository</h2>
        <p class="site-section__intro">
          Counted from the source by the same code that keeps the docs honest: the{' '}
          <a href={`${GITHUB}/blob/main/scripts/check-doc-claims.ts`} rel="noopener">
            doc-claims check
          </a>{' '}
          fails CI when a number in the docs drifts from the code.
        </p>
        <div class="open-grid">
          <Tile
            label="Published packages"
            stat={repo.ok ? { ok: true, value: repo.value.publishedPackages } : repo}
          />
          <Tile
            label="Lint rules"
            stat={repo.ok ? { ok: true, value: repo.value.lintRules } : repo}
            hint={repo.ok ? `in ${repo.value.lintCategories} categories` : undefined}
          />
          <Tile label="MCP tools" stat={repo.ok ? { ok: true, value: repo.value.mcpTools } : repo} />
          <Tile label="Docs pages" stat={repo.ok ? { ok: true, value: repo.value.docPages } : repo} />
          <Tile label="Test files" stat={repo.ok ? { ok: true, value: repo.value.testFiles } : repo} />
        </div>
      </section>

      <section class="site-section open-bench" aria-labelledby="open-bench">
        <h2 id="open-bench">Benchmarks, losses included</h2>
        <p>
          Every performance claim Pyreon makes is in one record, with the method, the machine and
          the cases where another framework wins. When a number turns out wrong, it is withdrawn
          in the record itself, with the reason, and the history keeps every edit.
        </p>
        <ul class="site-links">
          <li>
            <a href={`${GITHUB}/blob/main/BENCHMARKS.md`} rel="noopener">
              The benchmark record
            </a>
          </li>
          <li>
            <a href={`${GITHUB}/blob/main/BENCHMARKS.md#0-what-changed-and-what-is-withdrawn`} rel="noopener">
              What changed, and what is withdrawn
            </a>
          </li>
          <li>
            <a href={`${GITHUB}/commits/main/BENCHMARKS.md`} rel="noopener">
              Every revision of the record
            </a>
          </li>
          <li>
            <RouterLink to="/docs/benchmarks">How the benchmarks are run</RouterLink>
          </li>
        </ul>
      </section>
    </div>
  )
}
