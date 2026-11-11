export default function Home() {
  return (
    <main>
      <h1>Dev overlay fixture</h1>
      <ul>
        <li><a href="/ssr-error">SSR error</a></li>
        <li><a href="/loader-error">Loader error</a></li>
        <li><a href="/hydration">Hydration mismatch</a></li>
      </ul>
    </main>
  )
}
