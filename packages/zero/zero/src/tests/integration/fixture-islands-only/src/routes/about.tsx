import { RouterLink } from '@pyreon/router'

// A second full-app page, so a client-side navigation between app pages can
// be told apart from the full page load into an islands-only one.
export default function About() {
  return (
    <main data-testid="about-page">
      <RouterLink to="/static" data-testid="to-static">
        static
      </RouterLink>
    </main>
  )
}
