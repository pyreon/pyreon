// Route component as a plain VNode-shaped object — no `@pyreon/core`
// import because `@pyreon/core` is not a dependency of
// `@pyreon/zero-cli` and would not resolve from this fixture. The
// build tests only BUNDLE this file (mode "ssr" runs no prerender), so
// the component body is never executed.
export default function Home() {
  return { type: 'h1', props: { id: 'home' }, children: ['Hello from the zero build fixture'] }
}

export const meta = {
  title: 'Home',
}
