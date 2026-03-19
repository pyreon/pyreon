import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { generateContext } from "../context"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pyreon-context-"))
  // Write a package.json so version detection works
  fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({
      name: "test-app",
      version: "1.0.0",
      dependencies: { "@pyreon/core": "^0.5.0" },
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
  describe("route extraction", () => {
    it("extracts routes from createRouter call", async () => {
      writeFile(
        "src/router.ts",
        `import { createRouter } from "@pyreon/router"
const router = createRouter([
  { path: "/", name: "home", component: Home },
])
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.routes).toHaveLength(1)
      expect(ctx.routes[0]!.path).toBe("/")
      expect(ctx.routes[0]!.name).toBe("home")
    })

    it("extracts multiple routes from createRouter", async () => {
      // Use separate files to avoid surrounding-context bleed between routes
      writeFile(
        "src/router-a.ts",
        `import { createRouter } from "@pyreon/router"
const router = createRouter([
  { path: "/about", name: "about", component: About },
])
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const aboutRoute = ctx.routes.find((r) => r.path === "/about")
      expect(aboutRoute).toBeDefined()
      expect(aboutRoute!.name).toBe("about")
    })

    it("extracts routes from const routes = [...]", async () => {
      writeFile(
        "src/routes.ts",
        `const routes: RouteRecord[] = [
  { path: "/users", name: "users" },
  { path: "/settings", name: "settings" },
]
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.routes).toHaveLength(2)
      expect(ctx.routes[0]!.path).toBe("/users")
      expect(ctx.routes[1]!.path).toBe("/settings")
    })

    it("extracts route params", async () => {
      writeFile(
        "src/router.ts",
        `const routes = [
  { path: "/users/:id", name: "user" },
  { path: "/posts/:postId/comments/:commentId", name: "comment" },
  { path: "/items/:itemId?", name: "item" },
]
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.routes[0]!.params).toEqual(["id"])
      expect(ctx.routes[1]!.params).toEqual(["postId", "commentId"])
      expect(ctx.routes[2]!.params).toEqual(["itemId"])
    })

    it("detects loaders and guards", async () => {
      writeFile(
        "src/router-guarded.ts",
        `const routes = [
  { path: "/dashboard", loader: () => fetchData(), beforeEnter: checkAuth },
]
`,
      )
      writeFile(
        "src/router-public.ts",
        `const routes = [
  { path: "/public", name: "public" },
]
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const dashboard = ctx.routes.find((r) => r.path === "/dashboard")
      const pub = ctx.routes.find((r) => r.path === "/public")
      expect(dashboard).toBeDefined()
      expect(dashboard!.hasLoader).toBe(true)
      expect(dashboard!.hasGuard).toBe(true)
      expect(pub).toBeDefined()
      expect(pub!.hasLoader).toBe(false)
      expect(pub!.hasGuard).toBe(false)
    })

    it("returns empty routes for projects without routing", async () => {
      writeFile(
        "src/App.tsx",
        `export function App() { return <div>hello</div> }
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.routes).toEqual([])
    })
  })

  describe("component extraction", () => {
    it("extracts function components", async () => {
      writeFile(
        "src/components/Button.tsx",
        `export function Button({ label }: { label: string }) {
  return <button>{label}</button>
}
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const btn = ctx.components.find((c) => c.name === "Button")
      expect(btn).toBeDefined()
      expect(btn!.props.some((p) => p.includes("label"))).toBe(true)
    })

    it("extracts const arrow components", async () => {
      writeFile(
        "src/components/Card.tsx",
        `export const Card = ({ title }: CardProps) => {
  return <div class="card"><h2>{title}</h2></div>
}
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const card = ctx.components.find((c) => c.name === "Card")
      expect(card).toBeDefined()
      expect(card!.props.some((p) => p.includes("title"))).toBe(true)
    })

    it("detects signals in components", async () => {
      writeFile(
        "src/components/Counter.tsx",
        `import { signal } from "@pyreon/reactivity"
export function Counter() {
  const count = signal<number>(0)
  const name = signal("hello")
  return <div>{count()}</div>
}
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const counter = ctx.components.find((c) => c.name === "Counter")
      expect(counter).toBeDefined()
      expect(counter!.hasSignals).toBe(true)
      expect(counter!.signalNames).toContain("count")
      expect(counter!.signalNames).toContain("name")
    })

    it("reports hasSignals false when no signals used", async () => {
      writeFile(
        "src/components/Static.tsx",
        `export function Static() {
  return <p>No signals here</p>
}
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const s = ctx.components.find((c) => c.name === "Static")
      expect(s).toBeDefined()
      expect(s!.hasSignals).toBe(false)
      expect(s!.signalNames).toEqual([])
    })

    it("includes relative file path", async () => {
      writeFile(
        "src/deep/nested/Widget.tsx",
        `export function Widget() { return <div>w</div> }
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      const w = ctx.components.find((c) => c.name === "Widget")
      expect(w).toBeDefined()
      expect(w!.file).toBe(path.join("src", "deep", "nested", "Widget.tsx"))
    })
  })

  describe("island extraction", () => {
    it("extracts islands with name", async () => {
      writeFile(
        "src/islands/Search.tsx",
        `import { island } from "@pyreon/server"
export const SearchIsland = island(() => import("./SearchImpl"), { name: "Search" })
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.islands).toHaveLength(1)
      expect(ctx.islands[0]!.name).toBe("Search")
      expect(ctx.islands[0]!.hydrate).toBe("load")
    })

    it("extracts island with hydrate before name", async () => {
      writeFile(
        "src/islands/Nav.tsx",
        `import { island } from "@pyreon/server"
export const NavIsland = island(() => import("./NavImpl"), { hydrate: "visible", name: "Nav" })
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.islands).toHaveLength(1)
      expect(ctx.islands[0]!.name).toBe("Nav")
    })

    it("extracts multiple islands from one file", async () => {
      writeFile(
        "src/islands/index.tsx",
        `import { island } from "@pyreon/server"
export const A = island(() => import("./A"), { name: "AIsland" })
export const B = island(() => import("./B"), { name: "BIsland" })
`,
      )
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.islands).toHaveLength(2)
      expect(ctx.islands.map((i) => i.name).sort()).toEqual(["AIsland", "BIsland"])
    })
  })

  describe("output file", () => {
    it("writes .pyreon/context.json by default", async () => {
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      await generateContext({ cwd: tmpDir })
      const outPath = path.join(tmpDir, ".pyreon", "context.json")
      expect(fs.existsSync(outPath)).toBe(true)
      const parsed = JSON.parse(fs.readFileSync(outPath, "utf-8"))
      expect(parsed.framework).toBe("pyreon")
    })

    it("writes to custom outPath", async () => {
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const customOut = path.join(tmpDir, "custom", "output.json")
      await generateContext({ cwd: tmpDir, outPath: customOut })
      expect(fs.existsSync(customOut)).toBe(true)
    })

    it("ensures .pyreon/ is in .gitignore", async () => {
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      await generateContext({ cwd: tmpDir })
      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8")
      expect(gitignore).toContain(".pyreon/")
    })

    it("does not duplicate .pyreon/ in existing .gitignore", async () => {
      fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules/\n.pyreon/\n", "utf-8")
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      await generateContext({ cwd: tmpDir })
      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8")
      const matches = gitignore.match(/\.pyreon\//g)
      expect(matches).toHaveLength(1)
    })
  })

  describe("version detection", () => {
    it("reads version from @pyreon/* dependency", async () => {
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.version).toBe("0.5.0")
    })

    it("returns unknown when no package.json", async () => {
      fs.unlinkSync(path.join(tmpDir, "package.json"))
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.version).toBe("unknown")
    })
  })

  describe("edge cases", () => {
    it("skips node_modules", async () => {
      writeFile(
        "node_modules/some-lib/index.tsx",
        `export function LibComponent() { return <div /> }`,
      )
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.components.find((c) => c.name === "LibComponent")).toBeUndefined()
    })

    it("skips dist directory", async () => {
      writeFile("dist/App.tsx", `export function DistApp() { return <div /> }`)
      writeFile("src/App.tsx", `export function App() { return <div /> }`)
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.components.find((c) => c.name === "DistApp")).toBeUndefined()
    })

    it("handles empty project", async () => {
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.routes).toEqual([])
      expect(ctx.components).toEqual([])
      expect(ctx.islands).toEqual([])
    })

    it("includes generatedAt timestamp", async () => {
      const ctx = await generateContext({ cwd: tmpDir })
      expect(ctx.generatedAt).toBeTruthy()
      // Should be a valid ISO date
      expect(() => new Date(ctx.generatedAt)).not.toThrow()
    })
  })
})
