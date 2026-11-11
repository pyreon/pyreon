// Written by scripts/sync-site-content.ts from _channels.json. Do not edit: re-run the sync.
// Typecheck only (never imported): fails when _channels.json does not match ChannelsFile.
import type { ChannelsFile } from './types-site'

export const checked = {
  "blog": {
    "route": "/blog",
    "meta": {
      "title": "Pyreon blog",
      "description": "How Pyreon works and what it can do: components that run once, one codebase for the web and, experimentally, iOS and Android, and benchmarks you can run yourself."
    },
    "hero": {
      "eyebrow": "blog",
      "title": "Notes from the people building Pyreon.",
      "lede": "How the compiler and the runtime work, what each release changed, and the numbers behind the claims, losses included. Every post links the code it talks about.",
      "actions": [
        {
          "label": "RSS feed",
          "href": "/blog/rss.xml"
        },
        {
          "label": "Newsletter",
          "href": "/newsletter"
        }
      ]
    },
    "tagsLabel": "Browse posts by tag",
    "allTags": "all posts",
    "latest": "Latest",
    "readPost": "Read the post →",
    "list": {
      "title": "More posts",
      "text": "Newest first."
    },
    "upNext": {
      "title": "Up next",
      "text": "Written and scheduled. Each post goes live on its date, in the RSS feed the same day.",
      "planned": "Planned · {date}"
    },
    "empty": {
      "title": "The first post is on its way.",
      "text": "Posts are published on their date with the next daily deploy. Subscribe to the RSS feed and the first one reaches you the day it goes out."
    },
    "tag": {
      "eyebrow": "tag",
      "title": "Posts tagged #{tag}",
      "lede": "{count} {posts} tagged #{tag}, newest first.",
      "posts": [
        "post",
        "posts"
      ]
    },
    "pager": "More pages of posts",
    "page": "Page {page} of {pages}",
    "newer": "← Newer posts",
    "older": "Older posts →",
    "subscribe": {
      "title": "Get new posts",
      "text": "Every post goes to the RSS feed in full, the day it is published. No tracking, nothing to unsubscribe from.",
      "links": [
        {
          "label": "RSS feed",
          "href": "/blog/rss.xml"
        },
        {
          "label": "Newsletter",
          "href": "/newsletter"
        },
        {
          "label": "Releases on GitHub",
          "href": "https://github.com/pyreon/pyreon/releases"
        }
      ]
    },
    "bench": {
      "more": "How we measure, and every result →"
    },
    "post": {
      "back": "← All posts",
      "toc": "In this post",
      "copyLink": "Copy link",
      "copied": "Copied",
      "byline": "By {author}",
      "share": "Share",
      "more": "Keep reading",
      "previous": "Previous post",
      "next": "Next post",
      "related": "Related",
      "cta": {
        "title": "Try Pyreon in five minutes",
        "text": "One command scaffolds an app with routing and server rendering, ready to run and deploy.",
        "link": {
          "label": "Start a project",
          "href": "/docs/quickstart"
        }
      }
    }
  },
  "showcase": {
    "route": "/showcase",
    "meta": {
      "title": "Showcase · Pyreon",
      "description": "What you can build with Pyreon: a full-stack Zero app with dashboards, chat, kanban and document export, a local-first collaborative board, one tasks app for web, iOS and Android (experimental), and React, Vue, Solid, Preact and Svelte code running on Pyreon."
    },
    "hero": {
      "eyebrow": "showcase",
      "title": "Real apps, built with Pyreon.",
      "lede": "Every app on this page lives in the repository and every screenshot is taken from the running app. Clone once and each one is a single command away.",
      "actions": [
        {
          "label": "Browse the examples on GitHub",
          "href": "https://github.com/pyreon/pyreon/tree/main/examples"
        },
        {
          "label": "Start with the guide",
          "href": "/docs/getting-started"
        }
      ]
    },
    "setup": {
      "title": "Clone once.",
      "text": "You need Bun. `bun install` also builds every package, then each example below runs with its own command.",
      "command": "git clone https://github.com/pyreon/pyreon.git && cd pyreon && bun install"
    },
    "featured": {
      "label": "one zero app",
      "title": "Twelve apps in one Zero project.",
      "text": "Todos, a blog, chat, kanban, a forms wizard, invoice and resume builders that export PDF and DOCX, an i18n shop and a node-graph editor, each a file-routed section of one app. The dashboard puts queries, a sortable table, charts, a virtualized list, role-based permissions and toasts on one page.",
      "example": {
        "dir": "app-showcase",
        "title": "App showcase",
        "summary": "One Zero app with twelve file-routed sections, from a todo list to a node-graph editor.",
        "highlights": [
          "zero",
          "query",
          "table",
          "charts",
          "flow",
          "document",
          "form",
          "permissions",
          "ui-components"
        ],
        "run": "cd examples/app-showcase && bun run dev -- --port 5181",
        "open": "http://localhost:5181/dashboard"
      },
      "captures": [
        {
          "file": "showcase/app-dashboard.png",
          "label": "Dashboard: query, charts, coolgrid"
        },
        {
          "file": "showcase/app-kanban.png",
          "label": "Kanban: drag and drop, undo, roles"
        },
        {
          "file": "showcase/app-chat.png",
          "label": "Chat: channels and threads"
        },
        {
          "file": "showcase/app-invoice.png",
          "label": "Invoice: export to PDF and DOCX"
        },
        {
          "file": "showcase/app-todos.png",
          "label": "Todos: filters in the URL, shortcuts"
        }
      ]
    },
    "more": {
      "label": "more examples",
      "title": "More from the repository.",
      "text": "Each one is a complete app in `examples/`, with its source one click away.",
      "items": [
        {
          "dir": "hn-clone",
          "title": "Hacker News clone",
          "summary": "A statically generated Zero app reading the live Hacker News API: top, new, ask, show and jobs feeds, search, bookmarks, a sortable leaderboard and a stats page with charts, in English, Czech and German.",
          "highlights": [
            "zero",
            "query",
            "i18n",
            "head",
            "charts",
            "storage",
            "toast"
          ],
          "run": "cd examples/hn-clone && bun run dev -- --port 5235",
          "open": "http://localhost:5235",
          "note": "Needs an internet connection: the stories come from api.hnpwa.com."
        },
        {
          "dir": "collab-board",
          "title": "Collaborative board",
          "summary": "A local-first kanban board on `@pyreon/sync`: open it in two tabs and every edit, presence dot and cursor syncs live, with IndexedDB keeping the board across reloads. Card notes are a shared code editor stored as a CRDT.",
          "highlights": [
            "sync",
            "dnd",
            "virtual",
            "code",
            "query",
            "form",
            "toast"
          ],
          "run": "cd examples/collab-board && bun run dev -- --port 5189",
          "open": "http://localhost:5189",
          "note": "For sync across devices, also run the relay: `bun examples/collab-board/relay.ts`.",
          "liveDemo": "/showcase/collab-board/"
        },
        {
          "dir": "native-tasks-web",
          "title": "Tasks, on the web and on device",
          "summary": "A tasks app written once in `examples/native-tasks/src/TasksApp.tsx`: sign-in, task lists and detail screens, a dashboard and a chart gallery. The same source compiles to SwiftUI for iOS and Jetpack Compose for Android.",
          "highlights": [
            "primitives",
            "charts",
            "store",
            "router",
            "query",
            "form",
            "auth"
          ],
          "run": "cd examples/native-tasks-web && bun run dev -- --port 5204",
          "open": "http://localhost:5204",
          "note": "Sign in with any name of three or more characters.",
          "alsoSource": [
            {
              "label": "Shared source",
              "dir": "native-tasks"
            },
            {
              "label": "iOS project",
              "dir": "native-tasks-ios"
            },
            {
              "label": "Android project",
              "dir": "native-tasks-android"
            }
          ]
        },
        {
          "dir": "react-compat",
          "title": "React, Vue, Solid, Preact and Svelte compat",
          "summary": "Five apps, each written against its framework's own API (React hooks, the Vue Composition API, Solid signals, Preact hooks, Svelte stores) and running on Pyreon's reactive engine through one compiler option.",
          "highlights": [
            "react-compat",
            "core",
            "reactivity",
            "runtime-dom"
          ],
          "run": "cd examples/react-compat && bun run dev -- --port 5177",
          "open": "http://localhost:5177",
          "liveDemo": "/showcase/react-compat/",
          "alsoSource": [
            {
              "label": "Vue",
              "dir": "vue-compat"
            },
            {
              "label": "Solid",
              "dir": "solid-compat"
            },
            {
              "label": "Preact",
              "dir": "preact-compat"
            },
            {
              "label": "Svelte",
              "dir": "svelte-compat"
            }
          ]
        }
      ]
    },
    "submit": {
      "label": "built something?",
      "title": "Put your app here.",
      "text": "This page shows projects people build with Pyreon, and none are listed yet. Open an issue with a link, a screenshot and the packages you used, and yours can be the first.",
      "cta": {
        "label": "Submit your project",
        "href": "https://github.com/pyreon/pyreon/issues/new?title=Showcase%3A+"
      }
    },
    "labels": {
      "source": "Source on GitHub",
      "liveDemo": "Open the live demo",
      "open": "Then open {url}",
      "packages": "Pyreon packages it uses"
    }
  },
  "open": {
    "route": "/open",
    "meta": {
      "title": "Open stats · Pyreon",
      "description": "Pyreon in numbers, live: GitHub stars, contributors, issues, releases and npm downloads, plus the benchmark record with every withdrawn claim."
    },
    "hero": {
      "eyebrow": "open stats",
      "title": "Built in the open. Counted in public.",
      "lede": "Every number on this page is pulled from GitHub, npm and the repository on each daily deploy. Nobody types them in and nobody rounds them up.",
      "actions": [
        {
          "label": "Star on GitHub",
          "href": "https://github.com/pyreon/pyreon"
        }
      ]
    },
    "updated": "Last updated",
    "unavailable": "unavailable right now",
    "work": {
      "label": "the work",
      "title": "What has shipped.",
      "text": "Commits, pull requests, releases, packages and tests, counted straight from the source.",
      "tiles": [
        {
          "stat": "commits",
          "label": "Commits on main",
          "href": "https://github.com/pyreon/pyreon/commits/main"
        },
        {
          "stat": "mergedPrs",
          "label": "Merged pull requests",
          "href": "https://github.com/pyreon/pyreon/pulls?q=is%3Apr+is%3Amerged"
        },
        {
          "stat": "releases",
          "label": "Releases published",
          "href": "https://github.com/pyreon/pyreon/releases",
          "hint": "Latest: {latestTag}, {latestDate}"
        },
        {
          "stat": "publishedPackages",
          "label": "Published packages",
          "href": "/docs/package-catalog"
        },
        {
          "stat": "testFiles",
          "label": "Test files",
          "hint": "{browserTestFiles} of them run in real Chromium"
        },
        {
          "stat": "lintRules",
          "label": "Lint rules",
          "href": "/docs/lint",
          "hint": "in {lintCategories} categories"
        },
        {
          "stat": "mcpTools",
          "label": "MCP tools",
          "href": "/docs/mcp"
        },
        {
          "stat": "docPages",
          "label": "Docs pages",
          "href": "/docs/getting-started"
        }
      ],
      "note": "The package, lint-rule, MCP-tool and doc-page counts come from the same code as the doc-claims check, which fails CI the moment a number in the docs drifts from the code.",
      "noteLink": {
        "label": "The doc-claims check →",
        "href": "https://github.com/pyreon/pyreon/blob/main/scripts/check-doc-claims.ts"
      }
    },
    "downloads": {
      "label": "downloads",
      "title": "Installs from npm.",
      "text": "The last 7 days, with the last 30 underneath.",
      "monthly": "{count} in the last 30 days",
      "chart": "Weekly downloads of {package}, the package every Pyreon app installs, from npm's public download counts.",
      "chartMissing": "The download history is unavailable in this build. It comes back with the next deploy."
    },
    "community": {
      "label": "community",
      "title": "This is where it starts.",
      "text": "The first stars, the first forks and the first outside contributors are being counted right now, and yours can be one of them.",
      "tiles": [
        {
          "stat": "stars",
          "label": "Stars",
          "href": "https://github.com/pyreon/pyreon/stargazers"
        },
        {
          "stat": "forks",
          "label": "Forks",
          "href": "https://github.com/pyreon/pyreon/forks"
        },
        {
          "stat": "contributors",
          "label": "Contributors",
          "href": "https://github.com/pyreon/pyreon/graphs/contributors"
        },
        {
          "stat": "openIssues",
          "label": "Open issues",
          "href": "https://github.com/pyreon/pyreon/issues"
        },
        {
          "stat": "closedIssues",
          "label": "Closed issues",
          "href": "https://github.com/pyreon/pyreon/issues?q=is%3Aissue+is%3Aclosed"
        }
      ],
      "actions": [
        {
          "label": "Star the repo on GitHub",
          "href": "https://github.com/pyreon/pyreon"
        },
        {
          "label": "Find an issue to pick up",
          "href": "https://github.com/pyreon/pyreon/issues"
        },
        {
          "label": "Read the contributing guide",
          "href": "https://github.com/pyreon/pyreon/blob/main/CONTRIBUTING.md"
        }
      ]
    },
    "benchmarks": {
      "label": "benchmarks",
      "title": "Every claim in one record, losses included.",
      "text": "Every performance claim Pyreon makes is in one record, with the method, the machine and the cases where another framework wins. A number that turns out wrong is withdrawn in the record itself, with the reason, and the history keeps every edit.",
      "links": [
        {
          "label": "The benchmark record",
          "href": "https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md",
          "text": "Every result, the method and the machine."
        },
        {
          "label": "What changed, and what is withdrawn",
          "href": "https://github.com/pyreon/pyreon/blob/main/BENCHMARKS.md#0-what-changed-and-what-is-withdrawn",
          "text": "Claims taken back, with the reason."
        },
        {
          "label": "Every revision of the record",
          "href": "https://github.com/pyreon/pyreon/commits/main/BENCHMARKS.md",
          "text": "The git history of every edit."
        },
        {
          "label": "The benchmarks page",
          "href": "/benchmarks",
          "text": "The same record, drawn: charts, tables and how to reproduce it."
        }
      ]
    }
  },
  "discord": {
    "route": "/discord",
    "destination": "the Pyreon Discord",
    "meta": {
      "title": "Community · Pyreon",
      "description": "Talk to the people building Pyreon: questions, bug reports and ideas, answered in the open."
    },
    "hero": {
      "eyebrow": "discord",
      "title": "Talk to the people building Pyreon.",
      "lede": "The Pyreon Discord opens with the launch. Until then the conversation happens on GitHub, where every question and every answer stays searchable for the next person who hits the same thing.",
      "actions": [
        {
          "label": "Ask a question or report a bug",
          "href": "https://github.com/pyreon/pyreon/issues/new/choose"
        },
        {
          "label": "Browse open issues",
          "href": "https://github.com/pyreon/pyreon/issues"
        }
      ]
    },
    "sections": [
      {
        "kind": "links",
        "title": "Other ways to follow along",
        "items": [
          {
            "label": "The blog",
            "href": "/blog",
            "text": "How the compiler and the runtime work, and release write-ups."
          },
          {
            "label": "Releases on GitHub",
            "href": "https://github.com/pyreon/pyreon/releases",
            "text": "Watch the repository and pick Releases to hear about each one."
          },
          {
            "label": "Open stats",
            "href": "/open",
            "text": "The project in live numbers, refreshed daily."
          },
          {
            "label": "Community",
            "href": "/community",
            "text": "How to contribute, good first issues and where to report a bug."
          }
        ]
      }
    ],
    "redirect": {
      "title": "Taking you to {destination}.",
      "text": "If nothing happens in a second, use the link below.",
      "cta": "Continue to {destination}"
    }
  },
  "newsletter": {
    "route": "/newsletter",
    "destination": "the Pyreon newsletter",
    "meta": {
      "title": "Newsletter · Pyreon",
      "description": "Get every Pyreon post the day it goes out: deep dives into the compiler and runtime, measured benchmarks and release notes."
    },
    "hero": {
      "eyebrow": "newsletter",
      "title": "Every post, the day it goes out.",
      "lede": "Deep dives into how the compiler and the runtime work, benchmark results with the losses left in, and release write-ups. The email list opens with the launch; the RSS feed already carries every post in full, the moment it is published.",
      "actions": [
        {
          "label": "Subscribe with RSS",
          "href": "/blog/rss.xml"
        },
        {
          "label": "Read the blog",
          "href": "/blog"
        }
      ]
    },
    "feed": {
      "title": "Add the feed anywhere.",
      "text": "Paste this address into any feed reader, or into an RSS-to-email service to get each post by mail.",
      "url": "https://pyreon.dev/blog/rss.xml",
      "note": "Prefer GitHub? Watch pyreon/pyreon and choose Custom → Releases to get a notification for each release."
    },
    "sections": [
      {
        "kind": "links",
        "title": "Other ways to follow along",
        "items": [
          {
            "label": "Releases on GitHub",
            "href": "https://github.com/pyreon/pyreon/releases",
            "text": "Watch the repository and pick Releases to hear about each one."
          },
          {
            "label": "Discord",
            "href": "/discord",
            "text": "Questions, show-and-tell, and talking to the people who build it."
          },
          {
            "label": "Open stats",
            "href": "/open",
            "text": "The project in live numbers, refreshed daily."
          },
          {
            "label": "Community",
            "href": "/community",
            "text": "How to contribute, good first issues and where to report a bug."
          }
        ]
      }
    ],
    "redirect": {
      "title": "Taking you to {destination}.",
      "text": "If nothing happens in a second, use the link below.",
      "cta": "Continue to {destination}"
    }
  }
} satisfies ChannelsFile
