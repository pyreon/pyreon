import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { RouterLink } from '@pyreon/router'
import { usePageHead } from '../components/site-head'
import {
  REPO_URL,
  SHOWCASE,
  type ShowcaseExample,
  type ShowcaseTheme,
  sourceUrl,
  THEMES,
} from '../showcase/examples'

const SETUP = [`git clone ${REPO_URL}.git`, 'cd pyreon', 'bun install']

function ExampleCard(props: { example: ShowcaseExample }) {
  const ex = props.example
  return (
    <article class="showcase-card" id={ex.dir}>
      <div class={ex.mobile ? 'showcase-card__shots showcase-card__shots--pair' : 'showcase-card__shots'}>
        <img
          class="showcase-card__desktop"
          src={ex.desktop.src}
          alt={ex.desktop.alt}
          width={ex.desktop.width}
          height={ex.desktop.height}
          loading="lazy"
          decoding="async"
        />
        {ex.mobile ? (
          <img
            class="showcase-card__mobile"
            src={ex.mobile.src}
            alt={ex.mobile.alt}
            width={ex.mobile.width}
            height={ex.mobile.height}
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </div>
      <div class="showcase-card__body">
        <h3>{ex.title}</h3>
        <p>{ex.summary}</p>
        <ul class="showcase-card__packages" aria-label="Pyreon packages it uses">
          {ex.highlights.map((name) => (
            <li>@pyreon/{name}</li>
          ))}
        </ul>
        <p class="site-actions">
          {ex.liveDemo ? (
            <a class="site-button site-button--primary" href={ex.liveDemo} data-allow-reload>
              Open the live demo
            </a>
          ) : null}
          <a class="site-button" href={sourceUrl(ex.dir)} rel="noopener">
            Source on GitHub
          </a>
          {(ex.alsoSource ?? []).map((s) => (
            <a class="site-button site-button--quiet" href={sourceUrl(s.dir)} rel="noopener">
              {s.label}
            </a>
          ))}
        </p>
        <details class="showcase-card__run">
          <summary>Run it locally</summary>
          <pre class="site-code">
            <code>{[...SETUP, ...ex.run].join('\n')}</code>
          </pre>
          <p>
            Then open <code>{ex.open}</code>.
            {ex.note ? ` ${ex.note}` : ''}
          </p>
        </details>
      </div>
    </article>
  )
}

/** `/showcase` — example apps from the repository, grouped by what they show. */
export default function ShowcasePage() {
  usePageHead({
    path: '/showcase',
    title: 'Showcase · Pyreon',
    description:
      'What you can build with Pyreon: full-stack Zero apps, a local-first collaborative board, one tasks app for web, iOS and Android, and React, Vue, Solid, Preact and Svelte code running on Pyreon.',
  })
  const active = signal<ShowcaseTheme | 'all'>('all')
  const themes = THEMES.filter((t) => SHOWCASE.some((ex) => ex.theme === t.id))

  return (
    <div class="site-page showcase-page">
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Showcase</p>
        <h1>What you can build with Pyreon</h1>
        <p class="site-page__lead">
          Real apps from the repository, each one screenshotted from the running app. Clone the
          repo and every one of them is a single command away. Want the building blocks first?
          Browse the <a href="/atlas/" data-allow-reload>component catalog</a> or start with the{' '}
          <RouterLink to="/docs/getting-started">guide</RouterLink>.
        </p>
      </header>

      <fieldset class="showcase-filters">
        <legend class="site-visually-hidden">Filter by theme</legend>
        <button
          type="button"
          class="showcase-chip"
          aria-pressed={() => (active() === 'all' ? 'true' : 'false')}
          onClick={() => active.set('all')}
        >
          All
        </button>
        <For each={themes} by={(t) => t.id}>
          {(t) => (
            <button
              type="button"
              class="showcase-chip"
              aria-pressed={() => (active() === t.id ? 'true' : 'false')}
              onClick={() => active.set(t.id)}
            >
              {t.label}
            </button>
          )}
        </For>
      </fieldset>

      {themes.map((t) => (
        <section
          class="site-section showcase-group"
          aria-labelledby={`showcase-${t.id}`}
          hidden={() => active() !== 'all' && active() !== t.id}
        >
          <h2 id={`showcase-${t.id}`}>{t.label}</h2>
          <p class="site-section__intro">{t.blurb}</p>
          {SHOWCASE.filter((ex) => ex.theme === t.id).map((ex) => (
            <ExampleCard example={ex} />
          ))}
        </section>
      ))}
    </div>
  )
}
