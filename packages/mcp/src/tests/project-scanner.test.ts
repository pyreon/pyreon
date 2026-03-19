import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { generateContext } from "../project-scanner"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-scanner-"))
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      dependencies: { "@pyreon/core": "^0.5.0", "@pyreon/router": "~0.5.0" },
    }),
    "utf-8",
  )
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFile(relPath: string, content: string): void {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf-8")
}

describe("generateContext", () => {
  describe("basic structure", () => {
    it("returns a ProjectContext with correct framework field", () => {
      const ctx = generateContext(tmpDir)
      expect(ctx.framework).toBe("pyreon")
    })

    it("includes generatedAt as ISO timestamp", () => {
      const ctx = generateContext(tmpDir)
      expect(ctx.generatedAt).toBeTruthy()
      const d = new Date(ctx.generatedAt)
      expect(d.toISOString()).toBe(ctx.generatedAt)
    })

    it("reads version from @pyreon/* dependency", () => {
      const ctx = generateContext(tmpDir)
      expect(ctx.version).toBe("0.5.0")
    })

    it("returns unknown version without package.json", () => {
      fs.unlinkSync(path.join(tmpDir, "package.json"))
      const ctx = generateContext(tmpDir)
      expect(ctx.version).toBe("unknown")
    })

    it("falls back to package version if no @pyreon deps", () => {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "test", version: "2.0.0", dependencies: {} }),
        "utf-8",
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.version).toBe("2.0.0")
    })
  })

  describe("route extraction", () => {
    it("extracts routes from createRouter([...])", () => {
      writeFile(
        "src/router.ts",
        `import { createRouter } from "@pyreon/router"
const router = createRouter([
  { path: "/", name: "home", component: Home },
])
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.routes).toHaveLength(1)
      expect(ctx.routes[0]!.path).toBe("/")
      expect(ctx.routes[0]!.name).toBe("home")
    })

    it("extracts routes from const routes = [...]", () => {
      writeFile(
        "src/routes.ts",
        `const routes: RouteRecord[] = [
  { path: "/users", name: "users" },
]
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.routes).toHaveLength(1)
      expect(ctx.routes[0]!.path).toBe("/users")
      expect(ctx.routes[0]!.name).toBe("users")
    })

    it("extracts route params including optional", () => {
      writeFile(
        "src/router-users.ts",
        `const routes = [
  { path: "/users/:id" },
]
`,
      )
      writeFile(
        "src/router-posts.ts",
        `const routes = [
  { path: "/posts/:postId/comments/:commentId?" },
]
`,
      )
      const ctx = generateContext(tmpDir)
      const userRoute = ctx.routes.find((r) => r.path === "/users/:id")
      const postRoute = ctx.routes.find((r) => r.path === "/posts/:postId/comments/:commentId?")
      expect(userRoute!.params).toEqual(["id"])
      expect(postRoute!.params).toEqual(["postId", "commentId"])
    })

    it("detects loader property", () => {
      writeFile(
        "src/router.ts",
        `const routes = [
  { path: "/data", loader: () => fetch("/api/data") },
]
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.routes[0]!.hasLoader).toBe(true)
      expect(ctx.routes[0]!.hasGuard).toBe(false)
    })

    it("detects beforeEnter guard", () => {
      writeFile(
        "src/router-admin.ts",
        `const routes = [
  { path: "/admin", beforeEnter: requireAuth },
]
`,
      )
      const ctx = generateContext(tmpDir)
      const admin = ctx.routes.find((r) => r.path === "/admin")
      expect(admin!.hasGuard).toBe(true)
    })

    it("detects beforeLeave guard", () => {
      writeFile(
        "src/router-form.ts",
        `const routes = [
  { path: "/form", beforeLeave: confirmLeave },
]
`,
      )
      const ctx = generateContext(tmpDir)
      const form = ctx.routes.find((r) => r.path === "/form")
      expect(form!.hasGuard).toBe(true)
    })

    it("returns empty routes when no route patterns found", () => {
      writeFile("src/App.tsx", `export function App() { return <div>hello</div> }`)
      const ctx = generateContext(tmpDir)
      expect(ctx.routes).toEqual([])
    })
  })

  describe("component extraction", () => {
    it("extracts function declaration components", () => {
      writeFile(
        "src/App.tsx",
        `export function App({ title }: { title: string }) {
  return <h1>{title}</h1>
}
`,
      )
      const ctx = generateContext(tmpDir)
      const app = ctx.components.find((c) => c.name === "App")
      expect(app).toBeDefined()
      // Props parsing extracts prop names from destructured params
      expect(app!.props.some((p) => p.includes("title"))).toBe(true)
      expect(app!.file).toBe(path.join("src", "App.tsx"))
    })

    it("extracts const arrow components", () => {
      writeFile(
        "src/Card.tsx",
        `export const Card = ({ title }: CardProps) => {
  return <div>{title}</div>
}
`,
      )
      const ctx = generateContext(tmpDir)
      const card = ctx.components.find((c) => c.name === "Card")
      expect(card).toBeDefined()
      expect(card!.props.some((p) => p.includes("title"))).toBe(true)
    })

    it("detects signal usage inside components", () => {
      writeFile(
        "src/Counter.tsx",
        `import { signal } from "@pyreon/reactivity"
export function Counter() {
  const count = signal<number>(0)
  const label = signal("clicks")
  return <div>{count()}: {label()}</div>
}
`,
      )
      const ctx = generateContext(tmpDir)
      const counter = ctx.components.find((c) => c.name === "Counter")
      expect(counter).toBeDefined()
      expect(counter!.hasSignals).toBe(true)
      expect(counter!.signalNames).toContain("count")
      expect(counter!.signalNames).toContain("label")
    })

    it("reports hasSignals false when no signals", () => {
      writeFile(
        "src/Static.tsx",
        `export function Static() {
  return <p>No signals</p>
}
`,
      )
      const ctx = generateContext(tmpDir)
      const s = ctx.components.find((c) => c.name === "Static")
      expect(s).toBeDefined()
      expect(s!.hasSignals).toBe(false)
      expect(s!.signalNames).toEqual([])
    })

    it("extracts multiple components from one file", () => {
      writeFile(
        "src/components.tsx",
        `export function Header() { return <header>H</header> }
export function Footer() { return <footer>F</footer> }
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.components.find((c) => c.name === "Header")).toBeDefined()
      expect(ctx.components.find((c) => c.name === "Footer")).toBeDefined()
    })

    it("ignores lowercase function names (not components)", () => {
      writeFile(
        "src/utils.ts",
        `export function helper() { return 42 }
export const formatDate = (d: Date) => { return d.toISOString() }
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.components.find((c) => c.name === "helper")).toBeUndefined()
      expect(ctx.components.find((c) => c.name === "formatDate")).toBeUndefined()
    })
  })

  describe("island extraction", () => {
    it("extracts island with name", () => {
      writeFile(
        "src/islands/Search.tsx",
        `import { island } from "@pyreon/server"
export const SearchIsland = island(() => import("./SearchImpl"), { name: "Search" })
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.islands).toHaveLength(1)
      expect(ctx.islands[0]!.name).toBe("Search")
      expect(ctx.islands[0]!.hydrate).toBe("load")
      expect(ctx.islands[0]!.file).toBe(path.join("src", "islands", "Search.tsx"))
    })

    it("defaults hydrate to load when not specified", () => {
      writeFile(
        "src/islands/Nav.tsx",
        `import { island } from "@pyreon/server"
export const NavIsland = island(() => import("./Nav"), { name: "Nav" })
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.islands[0]!.hydrate).toBe("load")
    })

    it("extracts multiple islands from one file", () => {
      writeFile(
        "src/islands/index.tsx",
        `import { island } from "@pyreon/server"
export const A = island(() => import("./A"), { name: "AlphaIsland" })
export const B = island(() => import("./B"), { name: "BetaIsland" })
`,
      )
      const ctx = generateContext(tmpDir)
      expect(ctx.islands).toHaveLength(2)
      const names = ctx.islands.map((i) => i.name).sort()
      expect(names).toEqual(["AlphaIsland", "BetaIsland"])
    })

    it("returns empty islands when none declared", () => {
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = generateContext(tmpDir)
      expect(ctx.islands).toEqual([])
    })
  })

  describe("file scanning edge cases", () => {
    it("skips node_modules", () => {
      writeFile("node_modules/lib/index.tsx", `export function LibComp() { return <div /> }`)
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = generateContext(tmpDir)
      expect(ctx.components.find((c) => c.name === "LibComp")).toBeUndefined()
    })

    it("skips dist directory", () => {
      writeFile("dist/App.tsx", `export function DistApp() { return <div /> }`)
      const ctx = generateContext(tmpDir)
      expect(ctx.components.find((c) => c.name === "DistApp")).toBeUndefined()
    })

    it("skips .git directory", () => {
      writeFile(".git/hooks/pre-commit.tsx", `export function Hook() { return <div /> }`)
      const ctx = generateContext(tmpDir)
      expect(ctx.components.find((c) => c.name === "Hook")).toBeUndefined()
    })

    it("handles empty directory", () => {
      const ctx = generateContext(tmpDir)
      expect(ctx.routes).toEqual([])
      expect(ctx.components).toEqual([])
      expect(ctx.islands).toEqual([])
    })

    it("scans nested subdirectories", () => {
      writeFile(
        "src/features/auth/components/LoginForm.tsx",
        `export function LoginForm({ onSubmit }: { onSubmit: () => void }) {
  return <form>login</form>
}
`,
      )
      const ctx = generateContext(tmpDir)
      const login = ctx.components.find((c) => c.name === "LoginForm")
      expect(login).toBeDefined()
      expect(login!.props.some((p) => p.includes("onSubmit"))).toBe(true)
    })

    it("handles unreadable directory gracefully", () => {
      // Non-existent cwd should not throw
      const ctx = generateContext(path.join(tmpDir, "nonexistent"))
      expect(ctx.routes).toEqual([])
      expect(ctx.components).toEqual([])
      expect(ctx.islands).toEqual([])
      expect(ctx.version).toBe("unknown")
    })
  })
})
