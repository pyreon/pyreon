export const meta = {
  title: "Why signals beat hooks for content sites",
  date: "2026-04-25",
  description:
    "Pyreon's fine-grained reactivity model means a blog's interactive widgets don't pay the React re-render tax.",
  tags: ["pyreon", "reactivity"],
}

export default function Post() {
  return (
    <>
      <p>
        A typical content site has a few interactive widgets — a theme toggle, a search box, a
        comments thread — sitting in an otherwise static page. Most frameworks re-render the
        whole component subtree every time one of those widgets changes state. Pyreon doesn't.
      </p>

      <h2>Components run once</h2>

      <p>
        In Pyreon, a component function executes exactly once at mount. Reactivity comes from
        signals reading themselves at use sites — the framework subscribes the surrounding
        DOM node to the signal and updates only the affected text or attribute when the signal
        changes.
      </p>

      <pre>
        <code>
          {`const count = signal(0)

function Counter() {
  return <button onClick={() => count.update(n => n + 1)}>{count}</button>
}`}
        </code>
      </pre>

      <p>
        <code>{"{count}"}</code> auto-calls the signal in JSX (the compiler inserts the parens),
        and the framework binds the resulting text node to the signal's subscription set. When
        you click, only the button's text node updates — the component function never re-runs.
      </p>

      <h2>What this means for a blog</h2>

      <ul>
        <li>Toggling dark mode flips a single <code>data-theme</code> attribute on <code>html</code>.</li>
        <li>Live search filters update only the post list, not the layout.</li>
        <li>Embedded interactive demos don't re-render their surroundings.</li>
      </ul>

      <p>
        The blog template ships with a theme toggle in the header — open the page, switch
        themes, and watch only the relevant CSS variables update.
      </p>
    </>
  )
}
