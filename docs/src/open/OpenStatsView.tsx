import { island } from '@pyreon/zero'
import {
  formatCount,
  formatDay,
  formatTimestamp,
  type OpenStats,
  type RepoStats,
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

// The chart is interactive (tooltip, keyboard), so on this static page it is
// an island; the server still renders its first frame as SVG.
const TrendChartIsland = island(() => import('./TrendChart'), { name: 'OpenTrendChart', hydrate: 'visible', prefetch: 'idle' })

function DownloadTrend(props: { stats: OpenStats }) {
  const trend = props.stats.npm.trend
  if (!trend.ok) {
    return (
      <p class="open-chart open-chart--missing">
        Download history is {UNAVAILABLE}. It comes back with the next deploy.
      </p>
    )
  }
  return (
    <figure class="open-chart">
      <TrendChartIsland label={trend.value.label} points={trend.value.points} />
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
  const fromRepo = (key: keyof RepoStats): Stat<number> =>
    repo.ok ? { ok: true, value: repo.value[key] } : repo

  return (
    <div class="site-page open-page">
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Open stats</p>
        <h1>Built in the open. Counted in public.</h1>
        <p class="site-page__lead">
          Every number on this page is pulled from GitHub, npm and the repository itself on every
          daily deploy. Nobody types them in, nobody rounds them up. Here is what has shipped.
        </p>
        <p class="open-updated">
          Last updated <time datetime={stats.generatedAt}>{formatTimestamp(stats.generatedAt)}</time>
        </p>
      </header>

      <section class="site-section" aria-labelledby="open-work">
        <h2 id="open-work">The work</h2>
        <p class="site-section__intro">
          Commits, pull requests, releases, packages and tests, counted straight from the source.
        </p>
        <div class="open-grid open-grid--hero">
          <Tile label="Commits on main" stat={gh.commits} href={`${GITHUB}/commits/main`} />
          <Tile
            label="Merged pull requests"
            stat={gh.mergedPrs}
            href={`${GITHUB}/pulls?q=is%3Apr+is%3Amerged`}
          />
          <Tile
            label="Releases published"
            stat={gh.releases}
            hint={release.ok ? `Latest: ${release.value.tag}, ${formatDay(release.value.date)}` : undefined}
            href={release.ok ? release.value.url : `${GITHUB}/releases`}
          />
          <Tile label="Published packages" stat={fromRepo('publishedPackages')} href="/docs/package-catalog" />
          <Tile
            label="Test files"
            stat={fromRepo('testFiles')}
            hint={repo.ok ? `${formatCount(repo.value.browserTestFiles)} of them run in real Chromium` : undefined}
          />
          <Tile
            label="Lint rules"
            stat={fromRepo('lintRules')}
            hint={repo.ok ? `in ${repo.value.lintCategories} categories` : undefined}
            href="/docs/lint"
          />
          <Tile label="MCP tools" stat={fromRepo('mcpTools')} href="/docs/mcp" />
          <Tile label="Docs pages" stat={fromRepo('docPages')} href="/docs/getting-started" />
        </div>
        <p class="open-note">
          Repository counts come from the same code as the{' '}
          <a href={`${GITHUB}/blob/main/scripts/check-doc-claims.ts`} rel="noopener">
            doc-claims check
          </a>
          , which fails CI the moment a number in the docs drifts from the code.
        </p>
      </section>

      <section class="site-section" aria-labelledby="open-npm">
        <h2 id="open-npm">Downloads</h2>
        <p class="site-section__intro">Installs from npm in the last 7 days, with the last 30 underneath.</p>
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

      <section class="site-section" aria-labelledby="open-community">
        <h2 id="open-community">Community</h2>
        <p class="site-section__intro">
          This is where it starts. The first stars, the first forks and the first outside
          contributors are being counted right now, and yours can be one of them.
        </p>
        <div class="open-grid">
          <Tile label="Stars" stat={gh.stars} href={`${GITHUB}/stargazers`} />
          <Tile label="Forks" stat={gh.forks} href={`${GITHUB}/forks`} />
          <Tile label="Contributors" stat={gh.contributors} href={`${GITHUB}/graphs/contributors`} />
          <Tile label="Open issues" stat={gh.openIssues} href={`${GITHUB}/issues`} />
          <Tile
            label="Closed issues"
            stat={gh.closedIssues}
            href={`${GITHUB}/issues?q=is%3Aissue+is%3Aclosed`}
          />
        </div>
        <p class="site-actions">
          <a class="site-button site-button--primary" href={GITHUB} rel="noopener">
            Star the repo on GitHub
          </a>
          <a class="site-button" href={`${GITHUB}/issues`} rel="noopener">
            Find an issue to pick up
          </a>
          <a class="site-button" href={`${GITHUB}/blob/main/CONTRIBUTING.md`} rel="noopener">
            Read the contributing guide
          </a>
        </p>
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
            <a href="/docs/benchmarks">How the benchmarks are run</a>
          </li>
        </ul>
      </section>
    </div>
  )
}
