import { Link } from "@pyreon/zero/link"
import { ThemeToggle } from "@pyreon/zero/theme"

export function layout(props: { children: any }) {
  return (
    <>
      <header class="site-header">
        <div class="site-header-inner">
          <Link href="/" class="site-logo">
            Blog
          </Link>
          <nav class="site-nav">
            <Link href="/" prefetch="hover" exactActiveClass="nav-active">
              Home
            </Link>
            <Link href="/blog" prefetch="hover" activeClass="nav-active">
              All posts
            </Link>
            <Link href="/about" prefetch="hover" exactActiveClass="nav-active">
              About
            </Link>
            <a href="/rss.xml" title="RSS feed">
              RSS
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main class="site-main">
        <div class="site-main-inner">{props.children}</div>
      </main>

      <footer class="site-footer">Built with Pyreon Zero.</footer>
    </>
  )
}
